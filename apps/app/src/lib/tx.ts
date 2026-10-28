import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, useConfig, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { base } from 'wagmi/chains';
import { parseUnits, isAddress, type Address, type Hash } from 'viem';
import { releaseRuntimePath } from './runtime';

export type TxState =
  | 'idle'        // not clicked yet
  | 'pending'     // waiting for wallet signature
  | 'confirming'  // on-chain, waiting for block confirmation
  | 'success'     // receipt received + status === 'success'
  | 'error';      // user rejected / revert / receipt status === 'reverted'

export interface UseTxResult {
  /** Fire synchronously; read errors from state/error. */
  write: ReturnType<typeof useWriteContract>['writeContract'];
  /** Fire async; await for the hash. Throws if the user rejects. */
  writeAsync: ReturnType<typeof useWriteContract>['writeContractAsync'];
  state: TxState;
  hash: Hash | undefined;
  /** One readable sentence: the contract's revert reason, or the wallet library's short message. */
  error: string | null;
  /** True when the visitor declined in the wallet (EIP-1193 4001): a choice, not a failure. */
  declined: boolean;
  /** Reset back to idle (clear state after success/failure). */
  reset: () => void;
}

export const SSU_TOKEN_ADDRESS = (import.meta.env.VITE_SSU_TOKEN_ADDRESS ??
  '0x4b451e0DaFeDAA119F9cb55eac19d7011051E1b7') as Address;
export const SSU_DECIMALS = Number(import.meta.env.VITE_SSU_TOKEN_DECIMALS ?? '18');
export const SSU_SYMBOL = import.meta.env.VITE_SSU_TOKEN_SYMBOL ?? 'SSU';

export const SSU_ERC20_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'ok', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'ok', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: 'remaining', type: 'uint256' }],
  },
] as const;

/**
 * viem nests the useful error along `cause`, and wagmi's own errors are a separate
 * class family, so errors are matched by name and code rather than by class.
 */
function findCause(error: unknown, match: (candidate: unknown) => boolean): unknown {
  let current = error;
  for (let depth = 0; current != null && depth < 10; depth += 1) {
    if (match(current)) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

const named = (name: string) => (candidate: unknown) => (candidate as { name?: unknown }).name === name;

function isDeclined(error: unknown): boolean {
  return findCause(error, (candidate) => (
    named('UserRejectedRequestError')(candidate) || (candidate as { code?: unknown }).code === 4001
  )) !== undefined;
}

/** The contract's revert reason when there is one, else one plain sentence. */
function describeTxError(error: unknown): string {
  const revert = findCause(error, named('ContractFunctionRevertedError')) as
    | { reason?: string; data?: { errorName: string; args?: readonly unknown[] } }
    | undefined;
  if (revert?.reason) return revert.reason;
  if (revert?.data) return `${revert.data.errorName}(${(revert.data.args ?? []).map(String).join(', ')})`;
  // wagmi names only the chain id, so viem's own sentence ends in "– undefined".
  if (findCause(error, named('ChainMismatchError'))) {
    return 'The wallet is on a different network than this site. Switch networks in the wallet and try again.';
  }
  const short = (error as { shortMessage?: unknown } | null)?.shortMessage;
  if (typeof short === 'string' && short !== '') return short;
  return error instanceof Error ? error.message : String(error);
}

export function parseSsuAmount(amount: string | number): bigint {
  const value = typeof amount === 'number' ? amount.toString() : amount.trim();
  if (!value || Number(value) <= 0) {
    throw new Error(`Invalid ${SSU_SYMBOL} amount`);
  }
  return parseUnits(value, SSU_DECIMALS);
}

export interface PayWithSsuInput {
  /** Merchant or seller wallet that receives SSU. */
  to: Address;
  /** Human amount, for example "12.5" means 12.5 SSU. */
  amount: string | number;
}

export interface UseSsuPaymentResult extends UseTxResult {
  tokenAddress: Address;
  symbol: string;
  decimals: number;
  pay: (input: PayWithSsuInput) => void;
  payAsync: (input: PayWithSsuInput) => Promise<Hash>;
}

export interface ApproveSsuInput {
  /** Contract allowed to pull SSU — usually one of this project's contracts. */
  spender: Address;
  /** Human amount, for example "12.5" means 12.5 SSU. */
  amount: string | number;
}

export interface UseSsuApprovalResult extends UseTxResult {
  tokenAddress: Address;
  symbol: string;
  decimals: number;
  approve: (input: ApproveSsuInput) => void;
  approveAsync: (input: ApproveSsuInput) => Promise<Hash>;
}

/**
 * State-machine hook for a contract write. Merges useWriteContract +
 * useWaitForTransactionReceipt into one 5-state machine so every write call
 * doesn't hand-roll 4 booleans.
 *
 * Every write carries the site's chain (`chains[0]` in `wagmi.ts`) unless the call
 * names its own `chainId`, so a wallet sitting on another network is stopped
 * before anything is signed instead of sending the transaction there.
 *
 * Usage:
 *   const tx = useTx();
 *   <Button onClick={() => tx.write({ address, abi, functionName: 'foo', args: [] })}>
 *   {tx.state === 'pending' && 'Confirm in your wallet...'}
 *   {tx.state === 'confirming' && 'Confirming on-chain...'}
 *   {tx.state === 'success' && '✅ Done'}
 *   {tx.state === 'error' && <p className="text-destructive">{tx.error}</p>}
 */
export function useTx(): UseTxResult {
  const config = useConfig();
  const {
    writeContract,
    writeContractAsync,
    data: hash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();
  const withChain = <T extends object>(variables: T): T => ({ chainId: config.chains[0].id, ...variables });

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
    data: receipt,
  } = useWaitForTransactionReceipt({ hash });

  // Explicit priority: error > success > confirming > pending > idle
  const reverted = receipt?.status === 'reverted';
  const failure = writeError ?? receiptError ?? null;
  const state: TxState =
    failure || reverted
      ? 'error'
      : isConfirmed
      ? 'success'
      : isConfirming
      ? 'confirming'
      : isPending
      ? 'pending'
      : 'idle';

  const error = failure
    ? describeTxError(failure)
    : reverted
    ? 'Transaction reverted on-chain'
    : null;

  // wagmi's generic write signature cannot be inferred through a wrapper, so the
  // parameters are spelled out and the result asserted back to it; callers keep
  // wagmi's checks (an unknown functionName is still refused).
  type Write = UseTxResult['write'];
  type WriteAsync = UseTxResult['writeAsync'];
  return {
    write: ((variables: Parameters<Write>[0], options?: Parameters<Write>[1]) =>
      writeContract(withChain(variables), options)) as Write,
    writeAsync: ((variables: Parameters<WriteAsync>[0], options?: Parameters<WriteAsync>[1]) =>
      writeContractAsync(withChain(variables), options)) as WriteAsync,
    state,
    hash,
    error,
    declined: failure !== null && isDeclined(failure),
    reset,
  };
}

/**
 * An SSU `transfer` from the visitor's wallet.
 *
 * Sent on Base, where SSU lives; `chains` in wagmi.ts has to list `base`.
 */
export function useSsuPayment(): UseSsuPaymentResult {
  const tx = useTx();
  const { address: from } = useAccount();
  const lastTo = useRef<Address | undefined>(undefined);
  const reported = useRef<Set<string>>(new Set());

  // Tell the platform about each confirmed payment once, for the owner's income view.
  useEffect(() => {
    const to = lastTo.current;
    if (tx.state !== 'success' || !tx.hash || !from || !to || reported.current.has(tx.hash)) return;
    reported.current.add(tx.hash);
    void reportSsuPayment(tx.hash, from, to);
  }, [tx.state, tx.hash, from]);

  const buildTransfer = ({ to, amount }: PayWithSsuInput) => {
    if (!isAddress(to)) throw new Error('Invalid SSU recipient address');
    return {
      address: SSU_TOKEN_ADDRESS,
      abi: SSU_ERC20_ABI,
      functionName: 'transfer',
      args: [to, parseSsuAmount(amount)],
      chainId: base.id,
    } as const;
  };

  return {
    ...tx,
    tokenAddress: SSU_TOKEN_ADDRESS,
    symbol: SSU_SYMBOL,
    decimals: SSU_DECIMALS,
    pay: (input) => {
      const transfer = buildTransfer(input);
      lastTo.current = transfer.args[0];
      return tx.write(transfer);
    },
    payAsync: (input) => {
      const transfer = buildTransfer(input);
      lastTo.current = transfer.args[0];
      return tx.writeAsync(transfer);
    },
  };
}

const REPORT_RETRY_DELAYS_MS = [2000, 5000, 10000];

/** The platform may not see the transfer yet (409) or may be rate limiting (429): retry; anything else ends quietly. */
async function reportSsuPayment(txHash: Hash, from: Address, to: Address): Promise<void> {
  try {
    const endpoint = releaseRuntimePath('/_platform/payments/record');
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ txHash, from, to }),
      });
      if ((res.status !== 409 && res.status !== 429) || attempt >= REPORT_RETRY_DELAYS_MS.length) return;
      await new Promise((resolve) => setTimeout(resolve, REPORT_RETRY_DELAYS_MS[attempt]));
    }
  } catch {
    // Reporting never changes the payment's outcome.
  }
}

/**
 * ERC-20 `approve` for SSU — required before a contract that escrows SSU can
 * pull it with `transferFrom`.
 *
 * The transaction goes to the SSU token and names your contract as the
 * spender. Sending it to your own contract instead is the easy mistake, and a
 * silent one: ERC-721's `approve(address,uint256)` shares a selector with the
 * ERC-20 version, so on an NFT contract the call reaches a real function and
 * reverts deep inside as an unreadable wallet error. This hook fixes the
 * target so there is nothing to get backwards.
 *
 * Usage, with `escrow` the deployed contract the page found in the Agent API document (`agentApi()` from
 * '@/lib/agent-api', see skills-wire-frontend-to-contract):
 *   const approval = useSsuApproval();
 *   approval.approve({ spender: escrow.address, amount: price });
 *
 * Sent on Base, where SSU lives; `chains` in wagmi.ts has to list `base`.
 */
export function useSsuApproval(): UseSsuApprovalResult {
  const tx = useTx();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (tx.state !== 'success') return;
    // The approval changed what `useSsuAllowance` reads; refetch it.
    void queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] === 'readContract'
        && (query.queryKey[1] as { functionName?: unknown } | undefined)?.functionName === 'allowance',
    });
  }, [tx.state, queryClient]);

  const buildApprove = ({ spender, amount }: ApproveSsuInput) => {
    if (!isAddress(spender)) throw new Error('Invalid SSU spender address');
    return {
      address: SSU_TOKEN_ADDRESS,
      abi: SSU_ERC20_ABI,
      functionName: 'approve',
      args: [spender, parseSsuAmount(amount)],
      chainId: base.id,
    } as const;
  };

  return {
    ...tx,
    tokenAddress: SSU_TOKEN_ADDRESS,
    symbol: SSU_SYMBOL,
    decimals: SSU_DECIMALS,
    approve: (input) => tx.write(buildApprove(input)),
    approveAsync: (input) => tx.writeAsync(buildApprove(input)),
  };
}

export interface UseSsuAllowanceResult {
  /** SSU the spender may pull from the connected wallet, in base units; undefined until read. */
  allowance: bigint | undefined;
  /** Whether the allowance covers a human SSU amount such as "12.5"; false until read, and for an amount that is not a positive number. */
  covers: (amount: string | number) => boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * The connected wallet's SSU allowance for `spender` — read it to skip an approve
 * the wallet already gave. It refetches once a `useSsuApproval()` approve succeeds.
 *
 * Usage:
 *   const allowance = useSsuAllowance(escrowAddress);
 *   allowance.covers(price) ? <BuyButton /> : <ApproveButton />
 */
export function useSsuAllowance(spender: Address | undefined): UseSsuAllowanceResult {
  const { address: owner } = useAccount();
  const read = useReadContract({
    address: SSU_TOKEN_ADDRESS,
    abi: SSU_ERC20_ABI,
    functionName: 'allowance',
    args: owner && spender ? [owner, spender] : undefined,
    chainId: base.id,
    query: { enabled: Boolean(owner && spender) },
  });
  return {
    allowance: read.data,
    covers: (amount) => {
      if (read.data === undefined) return false;
      try {
        return read.data >= parseSsuAmount(amount);
      } catch {
        return false;
      }
    },
    isLoading: read.isLoading,
    error: read.error ? describeTxError(read.error) : null,
    refetch: () => void read.refetch(),
  };
}
