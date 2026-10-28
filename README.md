# The Cozy Coffee Table

The website for The Cozy Coffee Table, a neighbourhood café on Linden Row. Guests can read the barista's note of the day, browse the menu, see today's special and book a table. Staff get a simple page with today's bookings and a CSV export.

## What's inside

- **Frontend**: Vite + React + TypeScript in `src/`. The hero art, logo and the special's picture are all drawn in SVG, so there are no image files to host.
- **Server**: Express in `server/index.js`.
  - `GET /api/note`: a barista's note picked at random.
  - `GET /api/menu`: drinks and pastries with prices (in pence).
  - `GET /api/specials/today` and `GET /api/specials/today.svg`: today's special and its picture.
  - `POST /api/bookings`: books a table (validated with zod) and emails a confirmation.
  - `GET /api/bookings`: today's bookings for the staff page (no guest emails).
  - `GET /api/bookings.csv`: every booking as CSV (no guest emails).
  - `GET /health`: a health check.
- **Data**: bookings are saved in `server/data/bookings.json`.
- **Email**: confirmations are sent with nodemailer when `SMTP_URL` is set. Without it, they are printed to the console.

## Run it

You need Node.js 22 or newer.

```sh
npm install
cp .env.example .env   # optional: fill in SMTP_URL and MAIL_FROM
npm run dev
```

Open http://localhost:5173. The Vite dev server sends `/api` to the Express server on port 3000.

## Run it in production

```sh
npm run build
npm start
```

Express serves the built site from `dist/` and the API from the same port (`PORT`, default 3000).

## Pages

- `/` is the café's home page.
- `/#/staff` is the staff page with today's bookings. It has no login, which is why it never shows guest emails.
