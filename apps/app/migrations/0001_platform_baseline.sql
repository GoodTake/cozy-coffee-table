CREATE TABLE users (
  wallet_address text PRIMARY KEY CHECK (wallet_address ~ '^0x[a-f0-9]{40}$'),
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_public_read
  ON users
  FOR SELECT
  USING (true);

CREATE POLICY users_insert_self
  ON users
  FOR INSERT
  WITH CHECK (wallet_address = steps_request_wallet_address());

CREATE POLICY users_update_self
  ON users
  FOR UPDATE
  USING (wallet_address = steps_request_wallet_address());

CREATE POLICY users_delete_self
  ON users
  FOR DELETE
  USING (wallet_address = steps_request_wallet_address());

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL REFERENCES users(wallet_address)
    CHECK (wallet_address ~ '^0x[a-f0-9]{40}$'),
  item_type text NOT NULL CHECK (length(trim(item_type)) > 0),
  item_id text,
  item_name text NOT NULL CHECK (length(trim(item_name)) > 0),
  amount_ssu text NOT NULL
    CHECK (amount_ssu ~ '^[0-9]+(\.[0-9]+)?$' AND amount_ssu::numeric > 0),
  tx_hash text NOT NULL UNIQUE CHECK (tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
  status text NOT NULL DEFAULT 'paid'
    CHECK (status IN ('paid', 'refunded', 'cancelled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_wallet_created_idx
  ON orders (wallet_address, created_at DESC);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_select_self
  ON orders
  FOR SELECT
  USING (wallet_address = steps_request_wallet_address());

CREATE POLICY orders_insert_self
  ON orders
  FOR INSERT
  WITH CHECK (
    wallet_address = steps_request_wallet_address()
    AND status = 'paid'
  );
