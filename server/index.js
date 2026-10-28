import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { baristaNotes, bookingTimes, menu, renderSpecialSvg, todaysDate, todaysSpecial } from './cafe.js';
import { sendBookingConfirmation } from './mailer.js';
import { addBooking, listBookings } from './store.js';

const app = express();
app.use(express.json({ limit: '20kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/note', (_req, res) => {
  const pick = baristaNotes[Math.floor(Math.random() * baristaNotes.length)];
  res.json(pick);
});

app.get('/api/menu', (_req, res) => {
  res.json(menu);
});

app.get('/api/specials/today', (_req, res) => {
  const { name, description, price, kind } = todaysSpecial();
  res.json({ name, description, price, kind });
});

app.get('/api/specials/today.svg', (_req, res) => {
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=300').send(renderSpecialSvg(todaysSpecial()));
});

const bookingSchema = z.object({
  name: z.string().trim().min(1, 'Please tell us your name.').max(80),
  email: z.email('Please enter a valid email address.'),
  date: z.iso.date('Please pick a date.'),
  time: z.enum(bookingTimes, 'Please pick one of our table times.'),
  partySize: z.coerce.number().int().min(1, 'Tables are for 1 to 8 guests.').max(8, 'Tables are for 1 to 8 guests.'),
});

app.post('/api/bookings', async (req, res) => {
  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Please check the form.' });
  }
  if (parsed.data.date < todaysDate()) {
    return res.status(400).json({ error: 'Please pick today or a later date.' });
  }

  const booking = await addBooking(parsed.data);
  try {
    await sendBookingConfirmation(booking);
  } catch (error) {
    console.error('[mail] could not send the confirmation email', error);
  }

  res.status(201).json({
    booking: { id: booking.id, name: booking.name, date: booking.date, time: booking.time, partySize: booking.partySize },
    message: `Thanks, ${booking.name}! Your table for ${booking.partySize} is booked. We have emailed a confirmation to ${booking.email}.`,
  });
});

app.get('/api/bookings', async (_req, res) => {
  const date = todaysDate();
  const bookings = (await listBookings())
    .filter((b) => b.date === date)
    .map(({ id, name, time, partySize }) => ({ id, name, time, partySize }));
  res.json({ date, bookings });
});

function csvCell(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

app.get('/api/bookings.csv', async (_req, res) => {
  const rows = (await listBookings()).map((b) => [b.date, b.time, b.name, b.partySize, b.createdAt]);
  const csv = [['date', 'time', 'name', 'party_size', 'booked_at'], ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
  res.type('text/csv').set('Content-Disposition', 'attachment; filename="bookings.csv"').send(`${csv}\n`);
});

// In production, Express also serves the built site from dist/.
const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`The Cozy Coffee Table is listening on http://localhost:${port}`);
});
