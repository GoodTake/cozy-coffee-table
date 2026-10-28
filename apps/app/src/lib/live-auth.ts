import { releaseRuntimePath } from './runtime';

const WALLET_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const NONCE_PATTERN = /^[A-Za-z0-9]{8,128}$/;

export interface LiveAuthUser {
  walletAddress: string;
  chainId: number;
}

interface LiveAuthResponse {
  user: LiveAuthUser | null;
}

export interface BuildLiveSiweMessageInput {
  address: string;
  chainId: number;
  nonce: string;
  domain: string;
  uri: string;
  statement?: string;
}

function validAuthUser(value: unknown): value is LiveAuthUser {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.walletAddress === 'string'
    && WALLET_PATTERN.test(candidate.walletAddress)
    && Number.isSafeInteger(candidate.chainId)
    && (candidate.chainId as number) > 0;
}

export function buildLiveSiweMessage(
  input: BuildLiveSiweMessageInput,
): string {
  if (
    !WALLET_PATTERN.test(input.address)
    || !Number.isSafeInteger(input.chainId)
    || input.chainId <= 0
    || !NONCE_PATTERN.test(input.nonce)
    || !input.domain
    || /[\r\n]/.test(input.domain)
  ) {
    throw new Error('invalid_live_auth_challenge');
  }
  const uri = new URL(input.uri);
  if (uri.origin !== input.uri || uri.host !== input.domain) {
    throw new Error('invalid_live_auth_challenge');
  }
  const statement = (input.statement ?? 'Sign in to this app')
    .replace(/[\r\n]+/g, ' ')
    .trim();
  return `${input.domain} wants you to sign in with your Ethereum account:\n`
    + `${input.address}\n\n`
    + `${statement}\n\n`
    + `URI: ${input.uri}\n`
    + 'Version: 1\n'
    + `Chain ID: ${input.chainId}\n`
    + `Nonce: ${input.nonce}\n`
    + `Issued At: ${new Date().toISOString()}`;
}

async function liveAuthRequest(
  path: '/auth/me' | '/auth/wallet/nonce' | '/auth/wallet/verify',
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch(releaseRuntimePath(path), {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
  });
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok && !(path === '/auth/me' && response.status === 401)) {
    const code = (body as { error?: unknown } | null)?.error;
    throw new Error(`Live authentication failed (${response.status}${typeof code === 'string' ? `: ${code}` : ''})`);
  }
  return body;
}

const pendingSessions = new Map<string, Promise<LiveAuthUser>>();
const verifiedWallets = new Set<string>();
const sessionListeners = new Set<() => void>();

/** Whether this page has verified a Live sign-in for the wallet — from any `useUser()` on it. */
export function isLiveSessionVerified(address: string): boolean {
  return verifiedWallets.has(address.toLowerCase());
}

/** Called each time a wallet's Live sign-in is verified; returns the unsubscribe. */
export function subscribeLiveSession(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

function markVerified(address: string): void {
  if (verifiedWallets.has(address)) return;
  verifiedWallets.add(address);
  for (const listener of sessionListeners) listener();
}

/** The session cookie no longer speaks for this wallet (another wallet signed in since). */
function forgetVerified(address: string): void {
  if (!verifiedWallets.delete(address)) return;
  for (const listener of sessionListeners) listener();
}

interface SignInTarget {
  address: string;
  chainId: number;
  domain?: string;
  uri?: string;
  statement?: string;
}

async function signInMessage(input: SignInTarget): Promise<string> {
  const nonceBody = await liveAuthRequest('/auth/wallet/nonce', {
    method: 'POST',
    body: JSON.stringify({ address: input.address }),
  }) as { nonce?: unknown } | null;
  if (typeof nonceBody?.nonce !== 'string' || !NONCE_PATTERN.test(nonceBody.nonce)) {
    throw new Error('Live authentication returned an invalid challenge');
  }
  return buildLiveSiweMessage({
    address: input.address,
    chainId: input.chainId,
    nonce: nonceBody.nonce,
    domain: input.domain ?? window.location.host,
    uri: input.uri ?? window.location.origin,
    statement: input.statement,
  });
}

export interface PreparedLiveSignIn {
  key: string;
  message: string;
  preparedAt: number;
}

/** A prepared message is signed only while its nonce is well inside the server's 5-minute lifetime. */
const PREPARED_TTL_MS = 4 * 60_000;

/**
 * Fetch the nonce and build the sign-in message before the click that signs it,
 * so the click's first await is the wallet's signature: a popup wallet (Base
 * Account) is blocked when network round trips separate its popup from the click.
 */
export async function prepareLiveSignIn(input: SignInTarget): Promise<PreparedLiveSignIn> {
  const address = input.address.toLowerCase();
  if (!WALLET_PATTERN.test(address) || !Number.isSafeInteger(input.chainId)) {
    throw new Error('Wallet identity is unavailable');
  }
  const message = await signInMessage({ ...input, address });
  return { key: `${address}:${input.chainId}`, message, preparedAt: Date.now() };
}

export function ensureLiveWalletSession(input: SignInTarget & {
  signMessage: (message: string) => Promise<string>;
  /** Start a new request even when one for this wallet is still open — a click asking again. */
  fresh?: boolean;
  /** A message from `prepareLiveSignIn`, signed straight away while it is fresh. */
  prepared?: PreparedLiveSignIn;
}): Promise<LiveAuthUser> {
  const address = input.address.toLowerCase();
  if (!WALLET_PATTERN.test(address) || !Number.isSafeInteger(input.chainId)) {
    return Promise.reject(new Error('Wallet identity is unavailable'));
  }
  const key = `${address}:${input.chainId}`;
  const existing = input.fresh ? undefined : pendingSessions.get(key);
  if (existing) return existing;
  const prepared = input.prepared
    && input.prepared.key === key
    && Date.now() - input.prepared.preparedAt < PREPARED_TTL_MS
    ? input.prepared.message
    : undefined;

  const session = (async (): Promise<LiveAuthUser> => {
    let message = prepared;
    if (message === undefined) {
      const me = await liveAuthRequest('/auth/me') as LiveAuthResponse | null;
      if (
        validAuthUser(me?.user)
        && me.user.walletAddress.toLowerCase() === address
        && me.user.chainId === input.chainId
      ) {
        markVerified(address);
        return me.user;
      }
      forgetVerified(address);
      message = await signInMessage({ ...input, address });
    }
    const signature = await input.signMessage(message);
    const verified = await liveAuthRequest('/auth/wallet/verify', {
      method: 'POST',
      body: JSON.stringify({ message, signature }),
    }) as LiveAuthResponse | null;
    if (
      !validAuthUser(verified?.user)
      || verified.user.walletAddress.toLowerCase() !== address
      || verified.user.chainId !== input.chainId
    ) {
      throw new Error('Live authentication returned the wrong identity');
    }
    markVerified(address);
    return verified.user;
  })();

  pendingSessions.set(key, session);
  void session.finally(() => {
    if (pendingSessions.get(key) === session) pendingSessions.delete(key);
  }).catch(() => {});
  return session;
}
