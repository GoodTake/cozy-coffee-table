CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  booking_date date NOT NULL,
  booking_time text NOT NULL CHECK (booking_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  party_size integer NOT NULL CHECK (party_size BETWEEN 1 AND 8),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bookings_date_time_idx ON bookings (booking_date, booking_time);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY bookings_desk_select
  ON bookings
  FOR SELECT
  USING (steps_request_wallet_address() = '0x000000000000000000000000000000000000c0ff');

CREATE POLICY bookings_desk_insert
  ON bookings
  FOR INSERT
  WITH CHECK (steps_request_wallet_address() = '0x000000000000000000000000000000000000c0ff');

COMMENT ON TABLE bookings IS 'Table bookings. Only the booking desk identity that the App server uses (functions/bookings.js) can read or write them, so guest emails never reach a page.';
