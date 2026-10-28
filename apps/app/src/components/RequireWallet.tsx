import { usePlatformIdentity } from '../lib/useUser';
import type { ReactNode } from 'react';
import { useAccount, useChains, useSwitchChain } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';

/**
 * Wraps a page/section that requires login, letting a person through by
 * usePlatformIdentity()'s identity source. With a platform session (the World
 * path, a course App's Preview) it renders children once that session's wallet
 * is known, with no wallet connection. Otherwise, when no wallet is connected it
 * shows a centered prompt + ConnectButton; once connected on the site's chain it
 * renders children directly.
 *
 * The chain check is not decoration. Writes are signed by the visitor's wallet on
 * whatever network it sits on, and a chain without public endpoints in
 * `src/lib/wagmi.ts` is read through that wallet too. Better to say "switch to
 * <chain>" than to send a transaction to the wrong network or render a page of
 * zeroes.
 *
 * The caller owns the copy so it can come from the site's i18n layer; the
 * connect and switch-network copy defaults to English.
 *
 * This file is platform-owned and restored from the factory: an App that needs
 * a different look writes its own gate around useUser().
 *
 *   <RequireWallet message={t('wallet.connectToViewOrders')}>
 *     <OrdersList />
 *   </RequireWallet>
 */
export default function RequireWallet({
  children,
  message = 'Connect your wallet to continue',
  switchMessage,
  switchLabel,
}: {
  children: ReactNode;
  message?: ReactNode;
  /** Shown when the wallet is on another network. */
  switchMessage?: ReactNode;
  /** The switch button's text. */
  switchLabel?: ReactNode;
}) {
  const { identity, wallet, loading, error } = usePlatformIdentity();
  const { isConnected, chainId } = useAccount();
  const chains = useChains();
  const { switchChain, isPending } = useSwitchChain();
  const target = chains[0];

  if (identity === 'checking') return <p className="py-8 text-center text-sm">Loading…</p>;

  if (identity === 'platform') {
    if (loading) return <p className="py-8 text-center text-sm">Loading campus session…</p>;
    if (!wallet) return <p role="alert" className="py-8 text-center text-sm">{error ?? 'Return to Campus Earth to open this app.'}</p>;
    return <>{children}</>;
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <p className="text-muted-foreground">{message}</p>
        <ConnectButton />
      </div>
    );
  }

  if (target && chainId !== target.id) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <p className="text-muted-foreground">
          {switchMessage ?? `This site runs on ${target.name}. Switch your wallet to ${target.name} to continue.`}
        </p>
        <button
          type="button"
          className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
          disabled={isPending}
          onClick={() => switchChain({ chainId: target.id })}
        >
          {switchLabel ?? (isPending ? `Switching to ${target.name}…` : `Switch to ${target.name}`)}
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
