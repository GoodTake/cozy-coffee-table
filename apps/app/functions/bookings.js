// Bookings live in the App's `bookings` table (migrations/0002_add_bookings.sql).
// Guests book without signing in, so the server reads and writes the table as one
// fixed identity, the booking desk. The table's policies only let that identity in,
// so no page can read guest emails directly.
'use strict';

const { dataRequest } = require('./platform');

// An address nobody can sign in as. It is only an identity for the table's policies.
const BOOKING_DESK = '0x000000000000000000000000000000000000c0ff';

function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    date: row.booking_date,
    time: row.booking_time,
    partySize: row.party_size,
    createdAt: row.created_at,
  };
}

async function addBooking({ name, email, date, time, partySize }) {
  const [row] = await dataRequest('bookings', {
    as: BOOKING_DESK,
    method: 'POST',
    body: { name, email, booking_date: date, booking_time: time, party_size: partySize },
    returnRows: true,
  });
  return fromRow(row);
}

async function listBookingsOn(date) {
  const rows = await dataRequest('bookings', {
    as: BOOKING_DESK,
    query: `select=id,name,booking_time,party_size&booking_date=eq.${date}&order=booking_time.asc,created_at.asc`,
  });
  return rows.map((row) => ({ id: row.id, name: row.name, time: row.booking_time, partySize: row.party_size }));
}

async function listAllBookings() {
  const rows = await dataRequest('bookings', {
    as: BOOKING_DESK,
    query: 'select=name,booking_date,booking_time,party_size,created_at&order=booking_date.asc,booking_time.asc',
  });
  return rows.map((row) => ({
    name: row.name,
    date: row.booking_date,
    time: row.booking_time,
    partySize: row.party_size,
    createdAt: row.created_at,
  }));
}

module.exports = { addBooking, listBookingsOn, listAllBookings };
