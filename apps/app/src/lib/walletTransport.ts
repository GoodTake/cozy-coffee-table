import { ChainDisconnectedError, createTransport, ProviderDisconnectedError } from 'viem';
import type { EIP1193RequestFn, Transport } from 'viem';

/**
 * The part of a wagmi connection this transport needs: which chain the wallet
 * is on, and how to talk to it. Kept to this shape on purpose — it is what lets
 * this file stay free of a wagmi import, so it can be tested directly.
 */
export interface WalletConnection {
  chainId: number;
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

/** Resolved per request, never cached: a visitor connects, switches and disconnects. */
export type GetWalletConnection = () => Promise<WalletConnection | undefined>;

/**
 * Reads the chain through whichever wallet is currently connected.
 *
 * wagmi ships `unstable_connector` for this, but it finds the wallet by
 * connector *type* (`connectors.find((c) => c.type === 'injected')`), and a type
 * is neither reliable nor enumerable: RainbowKit's MetaMask entry is type
 * `'metaMask'`, a phone wallet is `'walletConnect'`, Base Account is
 * `'baseAccount'`, and a site can carry two connectors of the same type where
 * only one holds the session. The connection is the fact; the type is not.
 *
 * Nothing sits behind this transport: when the wallet cannot answer, the read
 * fails with that error. Which chains read through public endpoints instead of
 * the wallet is `wagmi.ts`'s call (`PUBLIC_RPC_URLS`).
 */
export function connectedWallet(getConnection: GetWalletConnection): Transport {
  return ({ chain, retryCount, timeout }) =>
    createTransport({
      key: 'wallet',
      name: 'Connected wallet',
      request: (async ({ method, params }) => {
        const connection = await getConnection();
        if (!connection)
          throw new ProviderDisconnectedError(
            new Error('Connect a wallet before reading from the chain.'),
          );
        // wagmi keeps this in step with the wallet's `chainChanged` events, so it
        // costs no round trip. Asking the provider for `eth_chainId` on every
        // read, the way `unstable_connector` does, would.
        if (chain && connection.chainId !== chain.id)
          throw new ChainDisconnectedError(
            new Error(
              `The wallet is on chain ${connection.chainId}, but this site reads chain ${chain.id} (${chain.name}). Switch networks in your wallet.`,
            ),
          );
        return connection.request({ method, params });
      }) as EIP1193RequestFn,
      retryCount,
      timeout,
      type: 'wallet',
    });
}

/**
 * The shape of a wagmi config this module reads, and nothing more.
 *
 * `getProvider()` is declared without parameters on purpose. wagmi's own
 * signature accepts `{ chainId }`, and passing one makes the WalletConnect
 * connector call `switchChain` on every single read — which awaits a `change`
 * event that a wallet already on that chain never emits. Reads would hang for
 * exactly the phone-wallet visitors this transport exists to serve.
 *
 * `getProvider` is optional because a connection fresh out of storage does not
 * have one: `@wagmi/core`'s `createConfig` persists a connection as just
 * `{ id, name, type, uid }`, and that is what the store hydrates with on page
 * load — `state.current` is already set, but the real connector only lands
 * once `reconnect()` finishes. Reading through that stub would call a method
 * that does not exist.
 */
export interface WagmiConnectionSource {
  state: {
    current: string | null;
    connections: Map<string, { chainId: number; connector: { getProvider?(): Promise<unknown> } }>;
  };
}

/** Bridges a wagmi config to `connectedWallet`, resolved fresh on every read. */
export function currentWalletConnection(
  getSource: () => WagmiConnectionSource | undefined,
): GetWalletConnection {
  return async () => {
    const state = getSource()?.state;
    const connection = state?.current ? state.connections.get(state.current) : undefined;
    // A connector without `getProvider` is the persisted stub described above,
    // not a real wallet — treat it the same as no connection at all, so a page
    // reading during the reconnect window gets the designed 4900 error instead
    // of a TypeError out of this transport's request function.
    if (!connection || typeof connection.connector.getProvider !== 'function') return undefined;
    // wagmi types `getProvider()` as returning `unknown`; every connector it can
    // return is EIP-1193, which is the one thing needed here.
    const provider = (await connection.connector.getProvider()) as {
      request: WalletConnection['request'];
    };
    return { chainId: connection.chainId, request: (args) => provider.request(args) };
  };
}
