'use strict';

const MAX_RESPONSE_BYTES = 512 * 1024;
const VALUE_NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;

class RuntimeConfigError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'RuntimeConfigError';
    this.code = code;
    this.status = status;
  }
}

let tokenCache = null;

function runtimeBinding(kind, name) {
  if (!VALUE_NAME_PATTERN.test(name)) {
    throw new RuntimeConfigError(kind === 'secrets'
      ? 'invalid_secret_name'
      : 'invalid_variable_name');
  }
  const baseUrl = process.env.STEPS_ENVIRONMENT_VALUE_BROKER_URL;
  const configuredToken = process.env.STEPS_RUNTIME_CONFIG_TOKEN;
  const unavailableCode = kind === 'secrets'
    ? 'secret_runtime_unavailable'
    : 'variable_runtime_unavailable';
  const invalidResponseCode = kind === 'secrets'
    ? 'secret_response_invalid'
    : 'variable_response_invalid';
  if (!baseUrl || !configuredToken || /\s/.test(configuredToken)) {
    throw new RuntimeConfigError(unavailableCode);
  }
  if (!tokenCache || tokenCache.configuredToken !== configuredToken) {
    tokenCache = { configuredToken, token: configuredToken };
  }
  let url;
  try {
    url = new URL(`${baseUrl.replace(/\/$/, '')}/${kind}/${encodeURIComponent(name)}`);
  } catch {
    throw new RuntimeConfigError(unavailableCode);
  }
  // The container reaches the broker over its internal plaintext network
  // (http:); `openstep dev` running on a developer machine reaches the same
  // broker over the public builder's HTTPS endpoint instead. Either way,
  // credentials embedded in the URL itself are still rejected.
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw new RuntimeConfigError(unavailableCode);
  }
  let refreshUrl = null;
  if (process.env.STEPS_RUNTIME_CONFIG_REFRESH_URL) {
    try {
      refreshUrl = new URL(process.env.STEPS_RUNTIME_CONFIG_REFRESH_URL);
      // Same http/https allowance as the broker URL above, for the same reason.
      if ((refreshUrl.protocol !== 'http:' && refreshUrl.protocol !== 'https:') || refreshUrl.username || refreshUrl.password) {
        throw new Error('invalid refresh URL');
      }
    } catch {
      throw new RuntimeConfigError(unavailableCode);
    }
  }
  return {
    url,
    token: tokenCache.token,
    refreshUrl,
    unavailableCode,
    invalidResponseCode,
  };
}

async function readBoundedBody(response, invalidResponseCode) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new RuntimeConfigError(invalidResponseCode, response.status);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function requestJson(url, token, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response;
  try {
    response = await fetch(url, {
      method: options.method || 'GET',
      cache: 'no-store',
      headers: { authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: controller.signal,
    });
  } catch {
    throw new RuntimeConfigError(options.unavailableCode || 'runtime_config_unavailable');
  } finally {
    clearTimeout(timeout);
  }
  const invalidResponseCode = options.invalidResponseCode
    || 'runtime_config_response_invalid';
  const body = await readBoundedBody(response, invalidResponseCode);
  let payload;
  try {
    payload = JSON.parse(body.toString('utf8'));
  } catch {
    throw new RuntimeConfigError(invalidResponseCode, response.status);
  }
  return { response, payload };
}

async function refreshCredential(refreshUrl, token, unavailableCode, invalidResponseCode) {
  const { response, payload } = await requestJson(refreshUrl, token, {
    method: 'POST',
    unavailableCode,
    invalidResponseCode,
  });
  if (!response.ok) {
    const code = typeof payload?.error === 'string'
      ? payload.error
      : unavailableCode;
    throw new RuntimeConfigError(code, response.status);
  }
  if (typeof payload?.token !== 'string' || !payload.token || /\s/.test(payload.token)) {
    throw new RuntimeConfigError(invalidResponseCode, response.status);
  }
  tokenCache.token = payload.token;
  return payload.token;
}

async function getValue(kind, name) {
  const binding = runtimeBinding(kind, name);
  let token = binding.token;
  let result = await requestJson(binding.url, token, {
    unavailableCode: binding.unavailableCode,
    invalidResponseCode: binding.invalidResponseCode,
  });
  // 401 means the credential itself did not verify; 409 (runtime_not_active)
  // means it verified but has been rotated away from -- the platform's
  // development runtime broker answers a superseded credential that way. Both
  // are "the copy I am holding is stale, fetch the current one"; treating only
  // 401 that way left a rotated credential failing every read forever, with
  // nothing in the error pointing at rotation.
  const stale = result.response.status === 401 || result.response.status === 409;
  if (stale && binding.refreshUrl) {
    token = await refreshCredential(
      binding.refreshUrl,
      token,
      binding.unavailableCode,
      binding.invalidResponseCode,
    );
    result = await requestJson(binding.url, token, {
      unavailableCode: binding.unavailableCode,
      invalidResponseCode: binding.invalidResponseCode,
    });
  }
  if (!result.response.ok) {
    const code = typeof result.payload?.error === 'string'
      ? result.payload.error
      : binding.unavailableCode;
    throw new RuntimeConfigError(code, result.response.status);
  }
  if (typeof result.payload?.value !== 'string' || result.payload.value.length === 0) {
    throw new RuntimeConfigError(binding.invalidResponseCode, result.response.status);
  }
  return result.payload.value;
}

async function getVariable(name) {
  return getValue('variables', name);
}

async function getSecret(name) {
  return getValue('secrets', name);
}

module.exports = { getVariable, getSecret, RuntimeConfigError };
