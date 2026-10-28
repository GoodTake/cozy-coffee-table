'use strict';

const { express, z } = require('./vendor.cjs');
const { sendEmail } = require('./platform');
const { SHOP_NAME, bookingTimes, menu, renderSpecialSvg, todaysDate, todaysSpecial } = require('./cafe');
const { addBooking, listAllBookings, listBookingsOn } = require('./bookings');
const { noteOfTheDay } = require('./note');

const app = express();
app.use(express.json({ limit: '20kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/note', async (_req, res) => {
  try {
    res.json(await noteOfTheDay());
  } catch (error) {
    console.error('[note] could not write the note of the day', error);
    res.status(502).json({ error: 'note_unavailable' });
  }
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

function formatDate(date) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}

app.post('/api/bookings', async (req, res) => {
  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Please check the form.' });
  }
  if (parsed.data.date < todaysDate()) {
    return res.status(400).json({ error: 'Please pick today or a later date.' });
  }

  const booking = await addBooking(parsed.data);

  let emailSent = false;
  try {
    await sendEmail({
      template: 'booking-confirmed',
      to: booking.email,
      data: {
        name: booking.name,
        when: `${formatDate(booking.date)} at ${booking.time}`,
        guests: booking.partySize === 1 ? '1 guest' : `${booking.partySize} guests`,
        shop: SHOP_NAME,
      },
    });
    emailSent = true;
  } catch (error) {
    console.error('[email] could not send the booking confirmation', error);
  }

  res.status(201).json({
    booking: { id: booking.id, name: booking.name, date: booking.date, time: booking.time, partySize: booking.partySize },
    emailSent,
    message: emailSent
      ? `Thanks, ${booking.name}! Your table for ${booking.partySize} is booked. We have emailed a confirmation to ${booking.email}.`
      : `Thanks, ${booking.name}! Your table for ${booking.partySize} is booked, but we could not send the confirmation email.`,
  });
});

app.get('/api/bookings', async (_req, res) => {
  const date = todaysDate();
  res.json({ date, bookings: await listBookingsOn(date) });
});

function csvCell(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

app.get('/api/bookings.csv', async (_req, res) => {
  const rows = (await listAllBookings()).map((b) => [b.date, b.time, b.name, b.partySize, b.createdAt]);
  const csv = [['date', 'time', 'name', 'party_size', 'booked_at'], ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
  // The live site drops Content-Disposition; the staff page names the file when it saves it.
  res.type('text/csv').send(`${csv}\n`);
});

// Answer failures as JSON, so the page can show them.
app.use((error, _req, res, _next) => {
  console.error('[server] request failed', error);
  // Body-parser errors (bad JSON, too large) carry their own 4xx status and `expose`.
  const status = error.expose ? error.status : 500;
  res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : 'Please check the form.' });
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => {
  console.log(`The Cozy Coffee Table API is listening on port ${port}`);
});
