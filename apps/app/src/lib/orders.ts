import { getSupabase } from './supabase';

export type OrderStatus = 'paid' | 'refunded' | 'cancelled';

export interface OrderRecord {
  id: string;
  wallet_address: string;
  item_type: string;
  item_id: string | null;
  item_name: string;
  amount_ssu: string;
  tx_hash: string;
  status: OrderStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreatePaidOrderInput {
  wallet_address: string;
  item_type: string;
  item_id?: string | number | null;
  item_name: string;
  amount_ssu: string | number;
  tx_hash: string;
  metadata?: Record<string, unknown>;
}

const WALLET_RE = /^0x[a-f0-9]{40}$/;
const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

export function normalizeWalletAddress(wallet: string): string {
  const normalized = wallet.trim().toLowerCase();
  if (!WALLET_RE.test(normalized)) throw new Error('Invalid wallet address');
  return normalized;
}

function normalizeAmountSsu(amount: string | number): string {
  const value = typeof amount === 'number' ? String(amount) : amount.trim();
  if (!/^[0-9]+(\.[0-9]+)?$/.test(value) || Number(value) <= 0) {
    throw new Error('Invalid SSU amount');
  }
  return value;
}

export function validatePaidOrderInput(input: CreatePaidOrderInput): void {
  normalizeWalletAddress(input.wallet_address);
  if (!input.item_type.trim()) throw new Error('Order item type is required');
  if (!input.item_name.trim()) throw new Error('Order item name is required');
  normalizeAmountSsu(input.amount_ssu);
  if (!TX_HASH_RE.test(input.tx_hash.trim())) throw new Error('Invalid transaction hash');
  if (input.metadata != null && (Array.isArray(input.metadata) || typeof input.metadata !== 'object')) {
    throw new Error('Order metadata must be an object');
  }
}

export async function createPaidOrder(input: CreatePaidOrderInput): Promise<OrderRecord> {
  validatePaidOrderInput(input);
  const wallet = normalizeWalletAddress(input.wallet_address);
  const amount = normalizeAmountSsu(input.amount_ssu);
  const { data, error } = await getSupabase()
    .from('orders')
    .insert({
      wallet_address: wallet,
      item_type: input.item_type.trim(),
      item_id: input.item_id == null ? null : String(input.item_id),
      item_name: input.item_name.trim(),
      amount_ssu: amount,
      tx_hash: input.tx_hash.trim(),
      status: 'paid',
      metadata: input.metadata ?? {},
    })
    .select()
    .single();
  if (error) throw error;
  return data as OrderRecord;
}

export async function listMyOrders(wallet: string, limit = 50): Promise<OrderRecord[]> {
  const normalized = normalizeWalletAddress(wallet);
  const { data, error } = await getSupabase()
    .from('orders')
    .select('*')
    .eq('wallet_address', normalized)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as OrderRecord[];
}
