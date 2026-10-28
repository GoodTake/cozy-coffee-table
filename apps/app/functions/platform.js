'use strict';
/**
 * Platform runtime services client for the functions backend.
 * Env (injected by the platform at deploy): STEPS_API_URL, STEPS_PROJECT_ID, STEPS_PROJECT_TOKEN.
 * A backend running locally via `openstep dev` never receives that project
 * token; it authenticates instead with STEPS_RUNTIME_CREDENTIAL, a scoped,
 * expiring credential sent as `Authorization: Bearer`. When both are set,
 * STEPS_PROJECT_TOKEN wins, so the container's request is unaffected.
 * That scoped credential is rotated by whoever issued it (the openstep CLI),
 * which makes the copy in this process's environment go stale roughly daily;
 * STEPS_RUNTIME_CONFIG_REFRESH_URL is where the current one is fetched from
 * when the platform rejects a stale copy. See refreshRuntimeCredential below.
 * Usage: const { invokeAI, sendEmail, externalRequest, completeMission, sendTransaction, chargeUser, agent, agentContract, files } = require('./platform');
 *        const text = await invokeAI({ prompt: '...' });
 *        const { id } = await sendEmail({ template: '...', to: '...', data: { ... } });
 *        const res = await externalRequest('https://api.example.com/v1/x', { method: 'POST', body });
 *        const { recorded } = await completeMission({ headers: req.headers, missionKey: '...' });
 *        const { transactionHash } = await sendTransaction({ to, data, idempotencyKey }); // or { calls: [{ to, data }, ...], idempotencyKey }
 *        const { charged, chargeId } = await chargeUser({ headers: req.headers, amount, action, idempotencyKey });
 *        const { address, abi, chainId, deployBlock } = await agentContract('coupon-ledger'); // or { app, ref } / { app, name }
 *        const document = await agent(); // the Agent API document: contracts, Apps, services; read at most every 5 seconds
 *        const hex = await rpc('eth_call', [{ to, data }, 'latest']); // Base mainnet, backend only
 *        const listing = await publicClient.readContract({ address, abi, functionName, args }); // viem, Base mainnet, backend only
 *        const rows = await dataRequest('orders', { as: walletAddress, query: 'status=eq.paid' }); // the project's own tables
 *        const { fileId, uploadUrl } = await files.createUpload({ name, contentType, maxBytes }); // the page PUTs the file to uploadUrl
 *        const { url } = await files.downloadUrl(fileId); // for a reader the App allows; also files.info / read / remove
 *
 * externalRequest: every third-party HTTPS call from the backend goes through
 * it. A published backend runs on an isolated network with no internet; the
 * platform sets STEPS_EGRESS_URL there and this helper reroutes the call
 * through the platform's guard, which only lets through the host names listed
 * in the project's Production Environment Value BACKEND_EGRESS_HOSTS. In the
 * preview and under `openstep dev` the variable is unset and the call goes to
 * the host directly, so the same code runs in both places.
 */
const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');
const { createPublicClient, custom, base } = require('./viem.cjs');

// The platform's own LLM call budget (RUNTIME_AI_TIMEOUT_MS) defaults to 60s
// server-side. This client timeout is set comfortably above that — so a slow
// but legitimate call isn't cut off before the server would itself return a
// clean llm_error — while still guaranteeing a hung socket can't leak forever
// and wedge the caller's function indefinitely.
const REQUEST_TIMEOUT_MS = 90_000;

// The scoped credential this process was started with, and the newer one it
// has since been handed. Kept in memory because process.env still holds the
// original after a rotation — the issuer cannot reach back into an already
// running process to update it.
let credentialCache = null;

function currentRuntimeCredential() {
  const configured = process.env.STEPS_RUNTIME_CREDENTIAL;
  if (!configured) return undefined;
  // Re-seeding on a changed env var keeps a restarted-with-new-env process
  // from using a cached credential belonging to a previous session.
  if (!credentialCache || credentialCache.configured !== configured) {
    credentialCache = { configured, token: configured };
  }
  return credentialCache.token;
}

// Resolves { statusCode, body } with the body as a Buffer; rejects only when the
// request itself failed (transport error or timeout). Status handling is the
// caller's job so that a rejected credential can be retried before it is
// turned into an error.
function requestOnce(url, serialized, headers, label) {
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: 'POST',
        headers,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks) }));
      },
    );
    req.on('error', reject);
    // Mirrors scaffold/backend/server.js's jsonRpc timeout pattern: destroy
    // with an Error and let the 'error' listener above turn it into a reject
    // — a destroyed ClientRequest always emits 'error' once, so this never
    // double-settles the promise.
    req.on('timeout', () => {
      req.destroy(new Error(`platform ${label} timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });
    req.end(serialized);
  });
}

/**
 * Fetches the credential the issuer currently holds and caches it, returning
 * it, or returns null if that is not possible for any reason.
 *
 * Never throws: a failed refresh must leave the original platform failure to
 * be reported as-is, rather than replacing it with a second, more confusing
 * one about a URL the caller never asked about.
 */
async function refreshRuntimeCredential(presented) {
  const configured = process.env.STEPS_RUNTIME_CONFIG_REFRESH_URL;
  if (!configured) return null;
  let url;
  try {
    url = new URL(configured);
  } catch {
    return null;
  }
  // Same allowance and same rejection of in-URL credentials as
  // runtime-config.js's own refresh URL check.
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    return null;
  }
  let result;
  try {
    result = await requestOnce(url, '', {
      'content-length': 0,
      authorization: `Bearer ${presented}`,
    }, 'credential refresh');
  } catch {
    return null;
  }
  if (result.statusCode !== 200) return null;
  let parsed = null;
  try { parsed = JSON.parse(result.body.toString('utf8')); } catch { return null; }
  if (!parsed || typeof parsed.token !== 'string' || !parsed.token || /\s/.test(parsed.token)) {
    return null;
  }
  if (credentialCache) credentialCache.token = parsed.token;
  return parsed.token;
}

// Sends one runtime call with the process's credential, refreshing a rotated
// runtime credential once; resolves { statusCode, body } like requestOnce.
async function sendRuntime(surface, payload, label, extraHeaders) {
  const base = process.env.STEPS_API_URL;
  const projectId = process.env.STEPS_PROJECT_ID;
  // The container holds a project credential bound to it: it expires, the
  // platform renews it in place while the container runs, and it is revoked
  // when the container goes. A locally-run backend never receives one by design — it holds only
  // the scoped, expiring STEPS_RUNTIME_CREDENTIAL instead (see
  // server/src/releases/runtime-credential-auth.ts). If a project somehow has
  // both set, the project token wins, so the container's request never changes.
  const projectToken = process.env.STEPS_PROJECT_TOKEN;
  const runtimeCredential = currentRuntimeCredential();
  if (!base || !projectId || (!projectToken && !runtimeCredential)) {
    throw new Error(
      'platform env missing (STEPS_API_URL / STEPS_PROJECT_ID / STEPS_PROJECT_TOKEN or STEPS_RUNTIME_CREDENTIAL)',
    );
  }
  const url = new URL(`${base.replace(/\/$/, '')}/api/projects/${projectId}/runtime/${surface}`);
  const serialized = JSON.stringify(payload);
  const headers = {
    ...extraHeaders,
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(serialized),
  };
  if (projectToken) {
    headers['x-project-token'] = projectToken;
  } else {
    headers.authorization = `Bearer ${runtimeCredential}`;
  }
  let result = await requestOnce(url, serialized, headers, label);
  // 401 = the credential did not verify; 409 = it verified but has been
  // rotated away from. Both mean the copy this process holds is stale, and
  // both are fatal-forever without this: the issuer cannot push a new value
  // into an already-running process, so every later call would fail the same
  // way. Only on the credential path — a container authenticating with
  // x-project-token holds a token bound to the container: it expires, the
  // platform renews it in place while the container runs, and it is replaced
  // only when the container is. Its request stays exactly one round trip.
  if (!projectToken && (result.statusCode === 401 || result.statusCode === 409)) {
    const refreshed = await refreshRuntimeCredential(runtimeCredential);
    if (refreshed && refreshed !== runtimeCredential) {
      headers.authorization = `Bearer ${refreshed}`;
      result = await requestOnce(url, serialized, headers, label);
    }
  }
  return result;
}

// A refused call as an Error carrying the platform's code.
function runtimeError(result, label, fallbackCode) {
  let parsed = null;
  try { parsed = JSON.parse(result.body.toString('utf8')); } catch { /* fallthrough */ }
  // Real failure shape is {error:{code,message}} (see
  // server/src/runtime-services/routes.ts's errorBody helper) — pull
  // both, since the code alone often isn't enough to debug from.
  const errInfo = parsed && parsed.error ? parsed.error : null;
  // Each caller's error domain should label its failures: AI surface
  // uses llm_error, email surface uses email_error. A shared transport
  // must not substitute one surface's error domain for another's.
  const code = errInfo && errInfo.code ? errInfo.code : fallbackCode;
  const text = result.body.toString('utf8');
  const detail = errInfo && errInfo.message ? errInfo.message : (text ? text.slice(0, 200) : `status ${result.statusCode}`);
  const err = new Error(`platform ${label} failed: ${code}: ${detail}`);
  err.code = code;
  return err;
}

async function postRuntime(surface, payload, label, fallbackCode, extraHeaders) {
  const result = await sendRuntime(surface, payload, label, extraHeaders);
  let parsed = null;
  try { parsed = JSON.parse(result.body.toString('utf8')); } catch { /* fallthrough */ }
  if (result.statusCode !== 200 || !parsed) throw runtimeError(result, label, fallbackCode);
  return parsed;
}

// The same call answered with raw bytes (files.read): a refusal is still JSON.
async function postRuntimeBytes(surface, payload, label, fallbackCode) {
  const result = await sendRuntime(surface, payload, label);
  if (result.statusCode !== 200) throw runtimeError(result, label, fallbackCode);
  return result.body;
}

/**
 * @param {{ prompt: string, system?: string, schema?: unknown }} input
 */
function invokeAI({ prompt, system, schema }) {
  return postRuntime('ai/invoke', { prompt, system, schema }, 'ai.invoke', 'llm_error').then((parsed) => {
    // Success shape is {kind:'text', text, charged} or {kind:'json', data, charged}
    // (see InvokeAiResponse in server/src/runtime-services/service.ts).
    if (parsed.kind === 'json') return parsed.data;
    if (parsed.kind === 'text') return parsed.text;
    throw new Error('platform ai.invoke failed: malformed response (unknown kind)');
  });
}

/**
 * Sends from a template registered with `npm run email:template`; `data`
 * supplies the template's declared slot values. The server rejects any other
 * shape (subject/html/text) on this platform-key surface with invalid_email.
 *
 * @param {{ template: string, to: string | string[], data?: Record<string, unknown>, replyTo?: string }} input
 */
function sendEmail({ template, to, data, replyTo }) {
  return postRuntime('email/send', { template, to, data, replyTo }, 'email.send', 'email_error').then((parsed) => {
    if (typeof parsed.id === 'string') return { id: parsed.id };
    throw new Error('platform email.send failed: malformed response (no id)');
  });
}

/**
 * Backend-only: the project payer vault is the contract's msg.sender.
 * Pass { to, data } for one call, or calls: [{ to, data }, ...] for several
 * calls run in order in one transaction that succeeds or reverts as a whole.
 * A repeat with the same idempotencyKey and the same calls sends no second transaction.
 *
 * @param {{ to?: string, data?: string, calls?: Array<{ to: string, data: string }>, idempotencyKey: string }} input
 */
function sendTransaction({ to, data, calls, idempotencyKey }) {
  return postRuntime('chain/send', { to, data, calls, idempotencyKey }, 'chain.send', 'chain_error').then((parsed) => {
    if (typeof parsed.transactionHash === 'string' && typeof parsed.sender === 'string') {
      return { transactionHash: parsed.transactionHash, sender: parsed.sender };
    }
    throw new Error('platform chain.send failed: malformed response (missing transactionHash or sender)');
  });
}

// Backend-only read of Base mainnet through the platform: one JSON-RPC request
// (for example eth_call), no RPC URL or egress host. Not metered; limited per
// project, and eth_getLogs block spans are capped.
function rpc(method, params) {
  const request = { jsonrpc: '2.0', id: 1, method, params: params === undefined ? [] : params };
  return postRuntime('rpc', request, 'rpc', 'rpc_error').then((parsed) => {
    if (parsed.error) {
      const err = new Error(`platform rpc failed: ${parsed.error.message || 'JSON-RPC error'}`);
      err.code = 'rpc_error';
      err.rpcCode = parsed.error.code;
      err.data = parsed.error.data;
      throw err;
    }
    if (!Object.prototype.hasOwnProperty.call(parsed, 'result')) {
      throw new Error('platform rpc failed: malformed response (no result)');
    }
    return parsed.result;
  });
}

function headerValue(headers, name) {
  if (!headers) return undefined;
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== name) continue;
    const value = headers[key];
    return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

/**
 * Backend-only: call it in the confirming App once the backend has verified the
 * mission's operation succeeded. `headers` is the incoming request's headers
 * (the verified wallet and the practice session). Never throws: the learner's
 * operation must not fail because the report did; it resolves { recorded: false }
 * when the platform is unreachable from here (preview probe) or refuses.
 *
 * @param {{ headers?: Record<string, string | string[] | undefined>, missionKey?: string }} [input]
 */
async function completeMission(input = {}) {
  try {
    const { headers, missionKey } = input || {};
    if (!process.env.STEPS_API_URL || !process.env.STEPS_PROJECT_ID) return { recorded: false };
    const wallet = headerValue(headers, 'x-steps-user-address');
    const practiceSessionId = headerValue(headers, 'x-steps-practice-session-id');
    const parsed = await postRuntime('course/complete', { wallet, missionKey }, 'course.complete', 'course_error',
      practiceSessionId ? { 'x-steps-practice-session-id': practiceSessionId } : undefined);
    return parsed.recorded === true && typeof parsed.completedAt === 'string'
      ? { recorded: true, completedAt: parsed.completedAt }
      : { recorded: false };
  } catch (error) {
    console.warn(`course.complete not recorded: ${(error && error.code) || 'course_error'}`);
    return { recorded: false };
  }
}

/**
 * Backend-only: charge the signed-in wallet's refundable SSU for a partner-enabled
 * Agent. `headers` is the incoming request's headers (the verified wallet); `amount`
 * is a decimal SSU string such as '2.5' (at most 18 decimals). A repeat with the same
 * idempotencyKey charges once. Unlike completeMission it throws on a platform
 * refusal (err.code, for example insufficient_balance): the caller must not
 * deliver what was not paid for. It resolves { charged: false, reason:
 * 'platform_unreachable' } only where no platform is reachable (preview probe).
 *
 * @param {{ headers?: Record<string, string | string[] | undefined>, amount?: string, action?: string, idempotencyKey?: string }} [input]
 */
async function chargeUser(input = {}) {
  const { headers, amount, action, idempotencyKey } = input || {};
  if (!process.env.STEPS_API_URL || !process.env.STEPS_PROJECT_ID) {
    return { charged: false, reason: 'platform_unreachable' };
  }
  const wallet = headerValue(headers, 'x-steps-user-address');
  const parsed = await postRuntime('partner/charge', { wallet, amount, action, idempotencyKey }, 'partner.charge', 'partner_charge_error');
  if (typeof parsed.chargeId === 'string') return { charged: true, chargeId: parsed.chargeId };
  throw new Error('platform partner.charge failed: malformed response');
}

/**
 * Backend-only: call a connected service (Connector) the owner authorized. The
 * platform holds the credential and checks the request; this returns the
 * provider's answer as { status, contentType, body }. Optional input.headers
 * carries only the nonsecret headers the connector allows. A platform refusal
 * throws (err.code, for example connector_needs_reconnect). Where no platform is
 * reachable (preview probe) it writes STEPS_CONNECTOR_UNVERIFIABLE:<connectorId>
 * to stdout and throws err.code 'connector_unverifiable'.
 *
 * `visitor` is the incoming request's headers (req.headers). For a need each
 * visitor connects their own account for, the platform signed the visitor into
 * them (x-steps-connector-visitor), and the call is made with that visitor's own
 * account and files; it goes in the body, the only part a published backend's
 * call keeps on its way to the platform. Nothing else from them is sent.
 */
const connectors = {
  async request(connectorId, input = {}) {
    unverifiableWithoutPlatform(connectorId);
    const { method, url, body, headers, visitor } = input || {};
    return postRuntime('connectors/request', {
      connectorId, method, url, body, ...(headers === undefined ? {} : { headers }),
      visitor: headerValue(visitor, 'x-steps-connector-visitor'),
    }, 'connectors.request', 'connector_error');
  },
  /** Backend-only: the file names and kinds picked for this App's slots (the visitor's own, with `visitor: req.headers`). */
  async resources(connectorId, input = {}) {
    unverifiableWithoutPlatform(connectorId);
    const { visitor } = input || {};
    return postRuntime('connectors/resources', {
      connectorId, visitor: headerValue(visitor, 'x-steps-connector-visitor'),
    }, 'connectors.resources', 'connector_error');
  },
};

function unverifiableWithoutPlatform(connectorId) {
  if (typeof connectorId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(connectorId)) {
    const invalid = new Error('connectorId must be a connector id such as google-drive');
    invalid.code = 'connector_invalid_request';
    throw invalid;
  }
  if (process.env.STEPS_API_URL && process.env.STEPS_PROJECT_ID) return;
  process.stdout.write(`STEPS_CONNECTOR_UNVERIFIABLE:${connectorId}\n`);
  const err = new Error(`connector ${connectorId} cannot be verified here: no platform is reachable`);
  err.code = 'connector_unverifiable';
  throw err;
}

// Backend-only, read-only: the Agent API document of the Agent this App belongs to -- its contracts with their
// addresses and ABIs, its Apps and its services. Public data, so it needs no wallet. It is read at most once every 5
// seconds, live included: an App a later build did not change keeps this process across a Publish, and a document
// held for the life of the process would go on serving the previous Publish's addresses. Callers that ask while a
// read is in flight share it, and a failed read is not kept.
const AGENT_DOCUMENT_TTL_MS = 5_000;
let agentRead = null;

function agent() {
  const now = Date.now();
  if (agentRead && now - agentRead.at < AGENT_DOCUMENT_TTL_MS) return agentRead.promise;
  const read = {
    at: now,
    promise: postRuntime('agent', {}, 'agent', 'agent_error').then((parsed) => {
      if (Array.isArray(parsed.contracts)) return parsed;
      throw new Error('platform agent failed: malformed response (no contracts)');
    }),
  };
  agentRead = read;
  read.promise.catch(() => { if (agentRead === read) agentRead = null; });
  return read.promise;
}

function agentContractError(code, message) {
  const err = new Error(`platform agent failed: ${code}: ${message}`);
  err.code = code;
  return err;
}

// Backend-only, read-only: where, on which chain and with which ABI one contract of the Agent lives. `reference` is the
// contract's blueprint key, or { app, ref } (the Foundry ref the App registered it under) or { app, name } (the
// contract's name in that App). Rejects with err.code 'contract_not_deployed' when the contract is registered but not
// deployed, and also on a live App for a contract the document lacks: what is live holds only the contracts that were
// deployed when the Agent was published. Rejects with 'contract_unknown' when a development document has no such contract.
async function agentContract(reference) {
  let matches;
  if (typeof reference === 'string' && reference) {
    matches = (contract) => contract.key === reference;
  } else if (reference && typeof reference === 'object' && typeof reference.app === 'string' && reference.app) {
    if (typeof reference.ref === 'string' && reference.ref) {
      matches = (contract) => contract.app === reference.app && contract.ref === reference.ref;
    } else if (typeof reference.name === 'string' && reference.name) {
      matches = (contract) => contract.app === reference.app && contract.name === reference.name;
    }
  }
  if (!matches) throw new TypeError('agentContract expects a contract key, { app, ref } or { app, name }');
  const document = await agent();
  const label = JSON.stringify(reference);
  const found = document.contracts.find(matches);
  if (!found) {
    if (document.environment === 'live') {
      throw agentContractError('contract_not_deployed', `contract ${label} was not deployed when this Agent was published`);
    }
    throw agentContractError('contract_unknown', `no contract of this Agent matches ${label}; compare it with the contracts in agent()`);
  }
  if (found.status !== 'deployed' || !found.address) {
    throw agentContractError('contract_not_deployed', `contract ${label} is registered but the Agent owner has not deployed it yet`);
  }
  return { address: found.address, abi: found.abi, chainId: found.chainId, deployBlock: found.deployBlock };
}

/**
 * fetch() for third-party HTTPS URLs that also works from a published backend.
 * Only absolute `https:` URLs are accepted (a published backend cannot reach
 * anything else anyway). When STEPS_EGRESS_URL is set the request is sent to
 * `${STEPS_EGRESS_URL}/<host>[:port]<path?query>` with the runtime credential
 * the guard expects; that credential never reaches the third party -- the
 * guard strips it before forwarding.
 *
 * @param {string | URL} input
 * @param {RequestInit} [init] fetch() options, `headers` included
 */
function externalRequest(input, init) {
  if (typeof input !== 'string' && !(input instanceof URL)) {
    return Promise.reject(new TypeError('externalRequest expects an absolute https URL string or URL'));
  }
  let url;
  try {
    url = new URL(String(input));
  } catch {
    return Promise.reject(new TypeError('externalRequest expects an absolute https URL'));
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    return Promise.reject(new TypeError('externalRequest only sends https URLs without credentials'));
  }
  // No automatic redirects in either mode: a published backend cannot follow
  // a Location to a host the guard has not seen, so the preview must not
  // silently follow one either. Callers that want to follow can pass redirect.
  const egress = process.env.STEPS_EGRESS_URL;
  if (!egress) return fetch(url, { redirect: 'manual', ...init });
  const credential = process.env.STEPS_PROJECT_TOKEN;
  if (!credential) {
    return Promise.reject(new Error('platform env missing (STEPS_EGRESS_URL is set without STEPS_PROJECT_TOKEN)'));
  }
  const headers = new Headers(init && init.headers ? init.headers : undefined);
  headers.set('x-project-token', credential);
  const target = `${egress.replace(/\/+$/, '')}/${url.host}${url.pathname}${url.search}`;
  return fetch(target, { redirect: 'manual', ...init, headers }).then((response) => {
    // The guard's own refusals (host not allowlisted, private address, broker
    // down) come back with this header; surface them as errors so they are
    // never mistaken for the third party's answer.
    const guardError = response.headers.get('x-steps-guard-error');
    if (guardError) {
      const error = new Error(`platform egress refused: ${guardError}`);
      error.code = guardError;
      error.status = response.status;
      throw error;
    }
    return response;
  });
}

// viem's public client for Base mainnet, sending each request through rpc() once.
// retryCount 0: viem otherwise retries every failed request three times, a
// deterministic revert included, and every retry counts against the project's
// rpc rate limit. A JSON-RPC error is rethrown with its numeric code so viem can
// decode a revert's data against the ABI.
// cacheTime 0: viem otherwise reuses the block number it fetched for up to a
// polling interval, so a read sent right after a confirmed write sees the
// state from before it.
const publicClient = createPublicClient({
  chain: base,
  cacheTime: 0,
  transport: custom({
    request: ({ method, params }) => rpc(method, params).catch((error) => {
      if (typeof error.rpcCode === 'number') error.code = error.rpcCode;
      throw error;
    }),
  }, { retryCount: 0 }),
});

/**
 * The project's own tables through the platform's data channel (PostgREST
 * syntax), read or written as one identity under the App's row-level security.
 * An insert answers 201 and an update or delete 204, both with an empty body
 * unless returnRows asks for the written rows; any empty answer resolves to [],
 * so an empty body is never parsed as JSON. A refusal rejects with `status` and
 * `code` (the data channel's own code when it sends one). Under `openstep dev`
 * the backend holds STEPS_RUNTIME_CREDENTIAL instead of the project token and
 * sends it as `Authorization: Bearer`, as postRuntime does.
 */
async function dataRequest(table, { as, query = '', method = 'GET', body, returnRows = false, prefer } = {}) {
  const dataUrl = process.env.STEPS_DATA_URL;
  const token = process.env.STEPS_PROJECT_TOKEN;
  const runtimeCredential = currentRuntimeCredential();
  if (!dataUrl || (!token && !runtimeCredential)) {
    throw new Error('platform env missing (STEPS_DATA_URL / STEPS_PROJECT_TOKEN or STEPS_RUNTIME_CREDENTIAL)');
  }
  if (typeof table !== 'string' || !/^[A-Za-z0-9_]+$/.test(table)) {
    throw new TypeError('dataRequest expects a table name');
  }
  if (typeof as !== 'string' || !as) {
    throw new TypeError('dataRequest needs `as`, the wallet address the request reads or writes as');
  }
  const headers = token
    ? { 'x-project-token': token, 'x-wallet-address': as }
    : { authorization: `Bearer ${runtimeCredential}`, 'x-wallet-address': as };
  const preferences = [prefer, returnRows ? 'return=representation' : ''].filter(Boolean);
  if (preferences.length) headers.prefer = preferences.join(',');
  if (body !== undefined) headers['content-type'] = 'application/json';
  const search = String(query).replace(/^\?/, '');
  const response = await fetch(`${dataUrl.replace(/\/+$/, '')}/${table}${search ? `?${search}` : ''}`, {
    method,
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }
  if (!response.ok) {
    const error = new Error(`data ${method} ${table} failed: ${response.status}`);
    error.status = response.status;
    // PostgREST answers { code }; the platform's own gateway refusals answer { error }.
    const reason = parsed && [parsed.code, parsed.error].find((value) => typeof value === 'string' && value);
    error.code = reason || 'data_request_failed';
    error.body = parsed === undefined ? text : parsed;
    throw error;
  }
  if (!text) return [];
  if (parsed === undefined) {
    const error = new Error(`data ${method} ${table} answered a body that is not JSON`);
    error.status = response.status;
    error.code = 'data_response_invalid';
    throw error;
  }
  return parsed;
}

function storageUnavailable() {
  const err = new Error('platform files are not available here: no platform is reachable');
  err.code = 'storage_unavailable';
  return err;
}

function filesCall(op, payload) {
  if (!process.env.STEPS_API_URL || !process.env.STEPS_PROJECT_ID) return Promise.reject(storageUnavailable());
  return postRuntime(`files/${op}`, payload, `files.${op}`, 'provider_unavailable');
}

/**
 * Backend-only: the App's private files (skills-platform-files). Who may upload a file, and who may read which, is the
 * App's own decision, made before these calls; the platform only checks the links it signs. The page PUTs a file to
 * the uploadUrl createUpload returns, so its bytes never pass through this backend. Each call rejects with err.code
 * (for example file_not_found, storage_full, insufficient_balance); while the platform builds or probes the App it
 * rejects with disabled or storage_unavailable.
 */
const files = {
  /** @param {{ name: string, contentType: string, maxBytes?: number }} input resolves { fileId, uploadUrl, expiresAt } */
  createUpload({ name, contentType, maxBytes } = {}) {
    return filesCall('upload', { name, contentType, maxBytes });
  },
  /** @param {string} fileId resolves { fileId, name, contentType, sizeBytes, status: 'pending' | 'ready', createdAt } */
  info(fileId) {
    return filesCall('info', { fileId });
  },
  /** @param {string} fileId @param {{ expiresInSeconds?: number, attachment?: boolean }} [options] resolves { url, expiresAt } */
  downloadUrl(fileId, { expiresInSeconds, attachment } = {}) {
    return filesCall('link', { fileId, expiresInSeconds, attachment });
  },
  /** @param {string} fileId resolves { removed: true } */
  remove(fileId) {
    return filesCall('remove', { fileId });
  },
  /** @param {string} fileId resolves { body: Buffer, name, contentType, sizeBytes } */
  async read(fileId) {
    const info = await files.info(fileId);
    const body = await postRuntimeBytes('files/read', { fileId }, 'files.read', 'provider_unavailable');
    return { body, name: info.name, contentType: info.contentType, sizeBytes: body.length };
  },
};

module.exports = { invokeAI, sendEmail, externalRequest, sendTransaction, rpc, publicClient, completeMission, dataRequest, chargeUser, agent, agentContract, connectors, files };
