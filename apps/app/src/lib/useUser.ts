import { useEffect, useState, useCallback, useRef, useSyncExternalStore } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { base } from 'wagmi/chains';
import {
  ensureLiveWalletSession,
  isLiveSessionVerified,
  prepareLiveSignIn,
  subscribeLiveSession,
  type PreparedLiveSignIn,
} from './live-auth';
import { getReleaseRuntimeContext, isReleaseRuntime } from './runtime';
import { getSupabase, isSupabaseConfigured, setCurrentWallet } from './supabase';

export interface UserProfile {
  wallet_address: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Live sign-in is verified on Base whatever chain the site's contracts use: the
 * platform's verifier accepts Base only, and a wallet sitting on another network
 * would otherwise sign a message the verifier then refuses.
 */
const SIGN_IN_CHAIN_ID = base.id;

const WALLET_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export interface PlatformIdentity {
  /** Where the visitor's wallet comes from: the platform session, or the wallet they connect. */
  identity: 'checking' | 'platform' | 'wallet';
  /** The platform session's wallet, lowercased; always null for `'wallet'` (read wagmi for that). */
  wallet: string | null;
  loading: boolean;
  error: string | null;
}

const CHECKING: PlatformIdentity = { identity: 'checking', wallet: null, loading: true, error: null };
const CONNECTED_WALLET: PlatformIdentity = { identity: 'wallet', wallet: null, loading: false, error: null };

// Preview asks /auth/me once per page load: the preview credential it answers
// for does not change while the page is open.
let previewIdentity: Promise<PlatformIdentity> | undefined;
let previewResolved: PlatformIdentity | undefined;

function askPreviewIdentity(): Promise<PlatformIdentity> {
  previewIdentity ??= fetch('/auth/me', { credentials: 'same-origin', headers: { accept: 'application/json' } })
    .then(async (response): Promise<PlatformIdentity> => {
      if (!response.ok) return CONNECTED_WALLET;
      const { user } = await response.json();
      if (!user || !WALLET_ADDRESS.test(user.walletAddress)) return CONNECTED_WALLET;
      return { identity: 'platform', wallet: user.walletAddress.toLowerCase(), loading: false, error: null };
    })
    // Anything but a session (none for this App, the SPA's HTML under `openstep dev`, offline) means the connected wallet.
    .catch(() => CONNECTED_WALLET)
    .then((resolved) => (previewResolved = resolved));
  return previewIdentity;
}

/**
 * Who the visitor is, without touching their profile: the World path and a
 * Preview with a platform session (a course App's) answer from same-origin
 * /auth/me; a public Live URL and any other Preview use the connected wallet.
 * It never reads `users`, signs in or sets the wallet header — useUser() does.
 */
export function usePlatformIdentity(): PlatformIdentity {
  const context = getReleaseRuntimeContext();
  const world = context?.projectId === 'world';
  const [state, setState] = useState<PlatformIdentity>(() => {
    if (world) return { identity: 'platform', wallet: null, loading: true, error: null };
    if (context) return CONNECTED_WALLET;
    return previewResolved ?? CHECKING;
  });
  useEffect(() => {
    if (!world) return;
    let active = true;
    fetch('/auth/me', { credentials: 'same-origin' }).then(async (response) => {
      if (!response.ok) throw new Error('Campus session is unavailable. Return to Campus Earth.');
      const { user } = await response.json();
      // A session that answers no user is a signed-out visitor (a sample of the App), not a lost one.
      if (user === null) {
        if (active) setState({ identity: 'platform', wallet: null, loading: false, error: null });
        return;
      }
      if (!user || !WALLET_ADDRESS.test(user.walletAddress)) throw new Error('Campus session is unavailable. Return to Campus Earth.');
      if (active) setState({ identity: 'platform', wallet: user.walletAddress.toLowerCase(), loading: false, error: null });
    }).catch((err) => {
      if (active) setState({ identity: 'platform', wallet: null, loading: false, error: (err as Error).message });
    });
    return () => { active = false; };
  }, [world]);
  const checking = state.identity === 'checking';
  useEffect(() => {
    if (!checking) return;
    let active = true;
    void askPreviewIdentity().then((resolved) => { if (active) setState(resolved); });
    return () => { active = false; };
  }, [checking]);
  return state;
}

/**
 * On the World path, identity comes from /auth/me without wallet connection or SIWE.
 * Public wallet login = connected wallet + a verified app session + a users row.
 * Live proves wallet ownership through same-origin SIWE and keeps the session
 * in an HttpOnly cookie. Preview remains bound to Development and uses its
 * explicit Development-only wallet-header fallback. A course App's Preview takes
 * the viewer's platform wallet from /auth/me, as the World path does, with no
 * wallet connection; any other Preview uses the connected wallet.
 *
 * On Live it asks for the signature once, right after the wallet connects. Some
 * wallets refuse a request no click started (Base Account blocks the popup) and a
 * visitor may decline, so `needsSignIn` stays true until the signature is
 * verified — including while that first request is open — and `signIn()` asks
 * again; call it from a click. A sign-in from any useUser() on the page counts
 * for all of them.
 *
 * With no wallet, wallet/profile are null and it stays quiet — <RequireWallet>
 * decides how to prompt.
 */
export function useUser() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const world = getReleaseRuntimeContext()?.projectId === 'world';
  const identity = usePlatformIdentity();
  const checking = identity.identity === 'checking';
  const wallet = identity.identity === 'platform'
    ? identity.wallet
    : identity.identity === 'wallet' && isConnected && address ? address.toLowerCase() : null;
  const live = isReleaseRuntime();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const statement = `Sign in to ${import.meta.env.VITE_APP_NAME ?? 'this app'}`;
  // Only the latest attempt may write state: a newer one (a click, a new wallet)
  // supersedes it, the way a `cancelled` flag would.
  const attempt = useRef(0);
  const prepared = useRef<PreparedLiveSignIn | null>(null);
  const verified = useSyncExternalStore(
    subscribeLiveSession,
    () => wallet !== null && isLiveSessionVerified(wallet),
  );
  const needsSignIn = live && !world && wallet !== null && !verified;

  // The fallback header is confined to Development. Live always clears it.
  // While Preview still asks /auth/me it is left alone: writing null would drop
  // the header another useUser() on the page has already set.
  useEffect(() => {
    if (checking) return;
    setCurrentWallet(live ? null : wallet);
  }, [checking, live, wallet]);

  const loadProfile = useCallback(async (signIn: { fresh: boolean; prepared?: PreparedLiveSignIn }) => {
    if (!wallet) return;
    const current = ++attempt.current;
    const stale = () => attempt.current !== current;
    if (!isSupabaseConfigured()) {
      setProfile(null);
      setError('Supabase is not configured for this preview.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (live && !world) {
        await ensureLiveWalletSession({
          address: wallet,
          chainId: SIGN_IN_CHAIN_ID,
          statement,
          signMessage: (message) => signMessageAsync({ message }),
          ...signIn,
        });
        if (stale()) return;
      }
      const supabase = getSupabase();
      const sel = await supabase
        .from('users')
        .select('*')
        .eq('wallet_address', wallet)
        .maybeSingle();
      if (sel.error) throw sel.error;
      if (sel.data) {
        if (!stale()) setProfile(sel.data as UserProfile);
        return;
      }
      const ins = await supabase
        .from('users')
        .insert({ wallet_address: wallet })
        .select()
        .single();
      if (ins.error) throw ins.error;
      if (!stale()) setProfile(ins.data as UserProfile);
    } catch (e) {
      if (!stale()) setError((e as Error).message);
    } finally {
      if (!stale()) setLoading(false);
    }
  }, [wallet, live, world, statement, signMessageAsync]);

  // fetch/create profile. On Live this is also the one automatic sign-in request,
  // and it runs again once any useUser() on the page has verified the wallet.
  useEffect(() => {
    if (!wallet) {
      attempt.current += 1;
      setProfile(null);
      setError(null);
      setLoading(false);
      return;
    }
    void loadProfile({ fresh: false });
    return () => { attempt.current += 1; };
  }, [wallet, verified, loadProfile]);

  // Once a sign-in attempt has failed, keep the next one's message ready (see
  // prepareLiveSignIn). Not before: a returning visitor's cookie answers without a
  // signature, and a nonce fetched on every page load would be wasted. Each failed
  // attempt sets `error` again, so a spent message is replaced.
  useEffect(() => {
    prepared.current = null;
    if (!needsSignIn || error === null || !wallet) return;
    let active = true;
    prepareLiveSignIn({ address: wallet, chainId: SIGN_IN_CHAIN_ID, statement })
      .then((ready) => { if (active) prepared.current = ready; })
      // Unprepared, signIn() fetches the nonce itself after the click.
      .catch(() => {});
    return () => { active = false; };
  }, [needsSignIn, error, wallet, statement]);

  const signIn = useCallback(async () => {
    const ready = prepared.current ?? undefined;
    prepared.current = null;
    await loadProfile({ fresh: true, prepared: ready });
  }, [loadProfile]);

  const updateProfile = useCallback(
    async (patch: Partial<Pick<UserProfile, 'display_name' | 'avatar_url'>>) => {
      if (!wallet) throw new Error('Wallet not connected');
      if (!isSupabaseConfigured()) throw new Error('Supabase is not configured for this preview.');
      if (live && !world) {
        await ensureLiveWalletSession({
          address: wallet,
          chainId: SIGN_IN_CHAIN_ID,
          statement,
          signMessage: (message) => signMessageAsync({ message }),
        });
      }
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('users')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('wallet_address', wallet)
        .select()
        .single();
      if (error) throw error;
      setProfile(data as UserProfile);
      return data as UserProfile;
    },
    [wallet, live, world, statement, signMessageAsync],
  );

  return {
    wallet,
    isConnected: identity.identity === 'wallet' ? isConnected : wallet !== null,
    profile,
    loading: loading || identity.loading,
    error: identity.error ?? error,
    updateProfile,
    needsSignIn,
    signIn,
  };
}
