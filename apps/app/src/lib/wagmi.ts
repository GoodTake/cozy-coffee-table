import { connectorsForWallets, getDefaultConfig } from '@rainbow-me/rainbowkit';
import type { RainbowKitWalletConnectParameters, WalletList } from '@rainbow-me/rainbowkit';
import {
  base as baseAccountWallet,
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  safeWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, fallback, http, type Transport } from 'wagmi';
import { base } from 'wagmi/chains';
import { connectedWallet, currentWalletConnection } from './walletTransport';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '';
const appName = import.meta.env.VITE_APP_NAME ?? 'STEPS Builder Prototype';

/** False when no WalletConnect project id reached the build; see `wagmiConfig`. */
export const walletConnectConfigured = projectId !== '';

/**
 * Optional, and only worth setting for a site with real read volume: an endpoint
 * of the owner's own (https://chainlist.org lists free ones; a paid key is
 * better), for the site's chain — the first in `chains`. Set, it is tried before
 * anything else.
 */
const ownRpcUrl = (import.meta.env.VITE_CHAIN_RPC_URL ?? '').trim();

/**
 * The site's chains. Changing the chain is this one line: `transports` follows it.
 * A site that takes SSU keeps `base` here, after its own chain — SSU lives on Base,
 * and wagmi refuses a chain this list does not name.
 */
const chains = [base] as const;

/**
 * Free public endpoints a chain is read through, so a visitor sees on-chain data
 * before connecting a wallet. Only Base has them: a chain missing here reads
 * through the visitor's own wallet instead. Both throttle heavy use, which is
 * what `VITE_CHAIN_RPC_URL` is for. When every endpoint fails the read fails
 * with the error — a page renders that, never empty data (the 2026-07-29
 * incident read a throttled endpoint as "my 5 NFTs disappeared").
 */
const PUBLIC_RPC_URLS: Partial<Record<number, readonly string[]>> = {
  [base.id]: [
    'https://base-rpc.publicnode.com',
    'https://base.public.blockpi.network/v1/rpc/public',
  ],
};

/**
 * The wallet transport (`walletTransport.ts`) needs the config to look inside,
 * and the config needs its transports first. Binding the reference afterwards is
 * safe: a read through it can only succeed once a wallet has connected, which is
 * necessarily after this module finished evaluating, and an unbound reference
 * reads as "no wallet connected" — an error, never wrong data.
 */
let connectedConfig: typeof wagmiConfig | undefined;

const walletTransport = connectedWallet(currentWalletConnection(() => connectedConfig));

function readTransport(chainId: number): Transport {
  const own = chainId === chains[0].id && ownRpcUrl ? [http(ownRpcUrl)] : [];
  const publicUrls = PUBLIC_RPC_URLS[chainId] ?? [];
  if (publicUrls.length === 0) return own.length > 0 ? fallback([...own, walletTransport]) : walletTransport;
  return fallback([...own, ...publicUrls.map((url) => http(url))]);
}

const transports = Object.fromEntries(
  chains.map((chain) => [chain.id, readTransport(chain.id)]),
) as Record<(typeof chains)[number]['id'], Transport>;

type CreateWalletFn = WalletList[number]['wallets'][number];

/**
 * Restore a wallet session without replaying its connect flow.
 *
 * The Base Account connector in @wagmi/connectors@6.2.0 sends `wallet_connect` on
 * every connect, including the `reconnect()` wagmi runs on mount. `wallet_connect`
 * opens the Base Account popup, and a popup outside a user gesture is blocked, so
 * every page load ended on the SDK's "wants to continue in Base Account" dialog.
 * The session already lives in the SDK's own storage, so read it back over
 * `eth_accounts` instead. Same fix as the platform's own `web/src/lib/wagmi.ts`;
 * drop it once RainbowKit supports wagmi 3 (@wagmi/connectors@8 fixed it upstream).
 *
 * Unlike a full connect this leaves the connector's provider event listeners
 * unregistered; wagmi drives account, chain and disconnect changes through its own
 * actions here, so nothing in this site depends on them.
 */
function withSilentReconnect(createWallet: CreateWalletFn): CreateWalletFn {
  return (walletParams) => {
    const wallet = createWallet(walletParams);
    return {
      ...wallet,
      createConnector: (walletDetails) => {
        const createConnector = wallet.createConnector(walletDetails);
        return (config) => {
          const connector = createConnector(config);
          return {
            ...connector,
            async connect<withCapabilities extends boolean = false>(params?: {
              chainId?: number | undefined;
              isReconnecting?: boolean | undefined;
              withCapabilities?: withCapabilities | boolean | undefined;
            }) {
              if (!params?.isReconnecting) return connector.connect<withCapabilities>(params);
              return {
                // `isReconnecting` only ever comes from wagmi's `reconnect()`, which
                // never asks for capabilities, so plain addresses are the right shape.
                accounts: (await connector.getAccounts()) as never,
                chainId: await connector.getChainId(),
              };
            },
          };
        };
      },
    };
  };
}

/** RainbowKit's default list, with Base Account restoring its session silently. */
const wallets: WalletList = [
  {
    groupName: 'Popular',
    wallets: [safeWallet, rainbowWallet, withSilentReconnect(baseAccountWallet), metaMaskWallet, walletConnectWallet],
  },
];

/**
 * `main.tsx` mounts this config for every site, wallet feature or not, and
 * RainbowKit's WalletConnect connector throws at construction without a project
 * id — so an empty id used to take the whole page down before React mounted.
 * Without one, offer browser-extension wallets only: `injectedWallet` never
 * builds a WalletConnect connector, so `<ConnectButton />` keeps working and
 * the site loses exactly one real thing, the phone-wallet QR flow.
 */
export const wagmiConfig = walletConnectConfigured
  ? getDefaultConfig({
    appName,
    projectId,
    chains,
    transports,
    wallets,
    ssr: false,
    // wagmi's WalletConnect connector only fills `optionalChains`, so without this a
    // phone wallet may approve a session that lacks the site's chain and then has
    // nothing to switch to. The cast covers wagmi's types omitting `chains`, which
    // its connector still forwards to `EthereumProvider.init` (pinned on the
    // platform side by web/src/lib/wagmi-walletconnect.test.ts).
    walletConnectParameters: { chains: [chains[0].id] } as RainbowKitWalletConnectParameters,
  })
  : createConfig({
    chains,
    transports,
    connectors: connectorsForWallets(
      [{ groupName: 'Installed', wallets: [injectedWallet] }],
      { appName, projectId },
    ),
    ssr: false,
  });

connectedConfig = wagmiConfig;
