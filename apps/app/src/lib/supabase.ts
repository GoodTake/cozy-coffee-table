import { createClient, type SupabaseClient as SupabaseClientType } from '@supabase/supabase-js';
import {
  getReleaseRuntimeContext,
  isReleaseRuntime,
  releaseRuntimePath,
  type ReleaseRuntimeContext,
} from './runtime';
// The schema types live in the project's own file: this one is rewritten from
// the factory scaffold on every preview start, which would drop them.
import type { Database } from './database.types';

const developmentUrl = import.meta.env.VITE_SUPABASE_URL as string;
const developmentAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const developmentSchema = (import.meta.env.VITE_SUPABASE_SCHEMA as string) || 'public';
const developmentGatewayPath = import.meta.env.VITE_SUPABASE_GATEWAY_PATH as string | undefined;
const MANAGED_GATEWAY_PLACEHOLDER_KEY = 'managed-by-release-data-gateway';

export interface DataClientRuntimeConfig {
  environment: 'development' | 'production';
  url: string;
  anonKey: string;
  schema: string;
}

export function resolveDataClientRuntimeConfig(input: {
  releaseContext: ReleaseRuntimeContext | null;
  origin: string;
  developmentUrl: string;
  developmentAnonKey: string;
  developmentSchema: string;
  developmentGatewayPath?: string;
}): DataClientRuntimeConfig {
  if (input.releaseContext) {
    return {
      environment: 'production',
      url: new URL(
        releaseRuntimePath('/data', input.releaseContext),
        input.origin,
      ).toString(),
      // Supabase requires a non-empty constructor value. The Live gateway
      // discards it and supplies the real short-lived server credential.
      anonKey: MANAGED_GATEWAY_PLACEHOLDER_KEY,
      schema: 'public',
    };
  }
  if (input.developmentGatewayPath) {
    const origin = new URL(input.origin);
    const gateway = new URL(input.developmentGatewayPath, origin);
    if (
      !input.developmentGatewayPath.startsWith('/')
      || input.developmentGatewayPath.startsWith('//')
      || gateway.origin !== origin.origin
      || gateway.search
      || gateway.hash
    ) {
      throw new Error('invalid_development_data_gateway');
    }
    return {
      environment: 'development',
      url: gateway.toString(),
      anonKey: MANAGED_GATEWAY_PLACEHOLDER_KEY,
      schema: 'public',
    };
  }
  return {
    environment: 'development',
    url: input.developmentUrl,
    anonKey: input.developmentAnonKey,
    schema: input.developmentSchema || 'public',
  };
}

export interface PreparedProductionDataRequest {
  input: RequestInfo | URL;
  init: RequestInit;
}

export function dataClientAuthOptions(managedGateway: boolean) {
  return managedGateway ? {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  } : {};
}

function prepareManagedDataRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  dataGatewayUrl: string,
  origin: string = window.location.origin,
  allowDevelopmentWallet = false,
): PreparedProductionDataRequest {
  const headers = new Headers(init?.headers);
  const wallet = allowDevelopmentWallet
    ? headers.get('x-wallet-address')
    : null;
  for (const name of [
    'accept-profile',
    'apikey',
    'authorization',
    'content-profile',
    'x-wallet-address',
  ]) {
    headers.delete(name);
  }
  if (wallet && /^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    headers.set('x-wallet-address', wallet.toLowerCase());
  }
  const requestUrl = new URL(
    input instanceof Request ? input.url : String(input),
    origin,
  );
  const dataUrl = new URL(dataGatewayUrl);
  const postgrestPath = `${dataUrl.pathname}/rest/v1`;
  if (
    requestUrl.origin !== dataUrl.origin
    || (
      requestUrl.pathname !== postgrestPath
      && !requestUrl.pathname.startsWith(`${postgrestPath}/`)
    )
  ) {
    throw new Error('release_data_gateway_bypass');
  }
  requestUrl.pathname = dataUrl.pathname
    + requestUrl.pathname.slice(postgrestPath.length);
  const routedInput = input instanceof Request
    ? new Request(requestUrl.toString(), input)
    : requestUrl.toString();
  return {
    input: routedInput,
    init: {
      ...init,
      credentials: 'same-origin',
      headers,
    },
  };
}

export function prepareProductionDataRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  dataGatewayUrl: string,
  origin: string = window.location.origin,
): PreparedProductionDataRequest {
  return prepareManagedDataRequest(input, init, dataGatewayUrl, origin);
}

export function prepareDevelopmentDataRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  dataGatewayUrl: string,
  origin: string = window.location.origin,
): PreparedProductionDataRequest {
  return prepareManagedDataRequest(input, init, dataGatewayUrl, origin, true);
}

function runtimeConfig(): DataClientRuntimeConfig {
  return resolveDataClientRuntimeConfig({
    releaseContext: getReleaseRuntimeContext(),
    origin: window.location.origin,
    developmentUrl,
    developmentAnonKey,
    developmentSchema,
    developmentGatewayPath,
  });
}

/**
 * Development-only identity fallback. Live ignores this value and derives the
 * Production JWT subject from its verified, HttpOnly SIWE session instead.
 */
let currentWallet: string | null = null;
export function setCurrentWallet(addr: string | null): void {
  currentWallet = isReleaseRuntime() ? null : (addr ? addr.toLowerCase() : null);
}

type SupabaseClient = SupabaseClientType<Database, 'public'>;

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  if (isReleaseRuntime()) return true;
  return Boolean(developmentGatewayPath || (developmentUrl && developmentAnonKey));
}

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured for this preview.');
  }
  const config = runtimeConfig();
  const managedGateway = config.anonKey === MANAGED_GATEWAY_PLACEHOLDER_KEY;
  client ??= createClient<Database, 'public'>(config.url, config.anonKey, {
    ...dataClientAuthOptions(managedGateway),
    db: { schema: config.schema as 'public' },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (managedGateway) {
          if (config.environment === 'development' && currentWallet) {
            headers.set('x-wallet-address', currentWallet);
          }
          const managedInit = { ...init, headers };
          const request = config.environment === 'production'
            ? prepareProductionDataRequest(input, managedInit, config.url)
            : prepareDevelopmentDataRequest(input, managedInit, config.url);
          return fetch(request.input, request.init);
        }
        if (currentWallet) headers.set('x-wallet-address', currentWallet);
        return fetch(input, { ...init, headers });
      },
    },
  });
  return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabase() as object, prop, receiver);
  },
});
