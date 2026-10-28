/**
 * The Agent API for pages: what the platform tells every App of an Agent about the Agent -- its contracts with their
 * addresses and ABIs, its Apps and its services.
 *
 * Platform-owned: the platform rewrites this file in every App, so a fix reaches Apps built before it. It imports only
 * `./runtime`, the other platform-owned file it needs; an App's own `./platform` may predate it.
 */

import { isReleaseRuntime, releaseRuntimePath } from './runtime';

export class AgentApiError extends Error {
  constructor(
    public readonly code: 'runtime_unavailable' | 'network_error' | 'rate_limited' | 'origin_denied' | 'agent_error',
    message: string,
  ) {
    super(message);
    this.name = 'AgentApiError';
  }
}

/** A contract of the Agent named by a sibling's connection: its blueprint key, or an App's own contract by its Foundry ref. */
export type AgentContractReference = { key: string } | { app: string; ref: string };

export interface AgentApiContract {
  /** The blueprint key the contract is called by across Apps; null for an App's private contract. */
  key: string | null;
  app: string;
  /** The Foundry ref the App registered it under, for example `src/Coupon.sol:Coupon`. */
  ref: string;
  /** The contract's name: the part of `ref` after its `:`. */
  name: string;
  status: 'deployed' | 'not_deployed';
  chainId: number;
  /** Null until the owner deploys the contract. */
  address: string | null;
  deployBlock: number | null;
  transactionHash: string | null;
  explorerAddressUrl: string | null;
  /** The deployed ABI; the registration's while the contract is not deployed. */
  abi: unknown[];
  abiDigest: string;
  notes: string | null;
  /** The connections the platform makes between contracts after a deploy, and where each stands. */
  links: Array<{
    function: string;
    args: Array<string | { contract: AgentContractReference }>;
    status: 'connected' | 'waiting' | 'pending' | 'failed';
    waitingFor?: AgentContractReference;
    code?: string;
    transactionHash?: string;
  }>;
  /** A deployed contract registered again with another ABI: that ABI's digest, until the owner deploys it. */
  pendingVersion: { abiDigest: string } | null;
}

/** What the platform tells every App of an Agent about the Agent. Public data only. */
export interface AgentApiDocument {
  schemaVersion: 1;
  agentId: string;
  /** `live` once the App is published: what the Agent was published with. Otherwise the current records. */
  environment: 'development' | 'live';
  /** This App's own appKey. */
  self: string | null;
  apps: Array<{ appKey: string; title: string }>;
  contracts: AgentApiContract[];
  services: Array<{ serviceKey: string; ownerApp: string; consumerApps: string[]; operationIds: string[] }>;
  capabilities: Array<{ key: string; enabled: boolean }>;
}

// Legacy published-path compatibility only, as `resolveProjectClaim` in `./platform`. Live identity comes from its
// Host and injected Release context, so it never sends this claim.
function projectClaim(): string | null {
  if (typeof window === 'undefined' || isReleaseRuntime()) return null;
  const m = window.location.pathname.match(/^\/published\/([^/]+)\//);
  return m ? m[1]! : null;
}

function agentApiErrorCode(status: number, code: string | undefined): AgentApiError['code'] {
  if (status === 501 || code === 'runtime_surface_unavailable') return 'runtime_unavailable';
  return code === 'rate_limited' || code === 'origin_denied' ? code : 'agent_error';
}

async function fetchAgentApi(): Promise<AgentApiDocument> {
  let endpoint: string;
  let claim: string | null;
  try {
    endpoint = releaseRuntimePath('/_platform/agent');
    claim = projectClaim();
  } catch {
    throw new AgentApiError('runtime_unavailable', 'platform runtime unavailable');
  }
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      referrerPolicy: 'same-origin',
      headers: {
        'content-type': 'application/json',
        ...(claim ? { 'x-steps-project': claim } : {}),
      },
      body: '{}',
    });
  } catch {
    throw new AgentApiError('network_error', 'platform unreachable');
  }
  const body = (await res.json().catch(() => null)) as
    | AgentApiDocument
    | { error?: { code?: string; message?: string } }
    | null;
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new AgentApiError(agentApiErrorCode(res.status, err?.code), err?.message ?? `status ${res.status}`);
  }
  if (body && 'contracts' in body && Array.isArray(body.contracts)) return body;
  throw new AgentApiError('agent_error', 'malformed platform response');
}

const AGENT_API_TTL_MS = 5_000;
let agentApiRead: { at: number; promise: Promise<AgentApiDocument> } | null = null;

/**
 * Read the Agent API document of the Agent this App belongs to: its contracts with their addresses and ABIs, its Apps
 * and its services. Read-only and public data, so no wallet is involved. This is where a page gets a contract's address
 * and ABI -- never copy them into code. A contract whose `status` is `not_deployed` has no address yet: show that it
 * is not deployed instead of failing. A live page reads what the Agent was published with; preview reads the current
 * records. The answer is kept for 5 seconds (a page's other platform calls share a small per-visitor rate limit), and
 * callers that ask while a read is in flight share it. A failed read rejects with an `AgentApiError` and is not kept.
 */
export function agentApi(): Promise<AgentApiDocument> {
  const now = Date.now();
  if (agentApiRead && now - agentApiRead.at < AGENT_API_TTL_MS) return agentApiRead.promise;
  const read = { at: now, promise: fetchAgentApi() };
  agentApiRead = read;
  read.promise.catch(() => { if (agentApiRead === read) agentApiRead = null; });
  return read.promise;
}
