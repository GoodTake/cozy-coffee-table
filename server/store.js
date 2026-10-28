// A tiny JSON-file store for bookings. Good enough for one café.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const bookingsFile = path.join(dataDir, 'bookings.json');

let writeQueue = Promise.resolve();

async function readAll() {
  try {
    return JSON.parse(await readFile(bookingsFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function listBookings() {
  const bookings = await readAll();
  return bookings.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

export function addBooking(input) {
  const booking = { id: randomUUID(), ...input, createdAt: new Date().toISOString() };
  // Serialise writes so two bookings at once never overwrite each other.
  const run = writeQueue.then(async () => {
    const bookings = await readAll();
    bookings.push(booking);
    await mkdir(dataDir, { recursive: true });
    await writeFile(bookingsFile, JSON.stringify(bookings, null, 2));
    return booking;
  });
  writeQueue = run.catch(() => {});
  return run;
}
