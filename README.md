# The Cozy Coffee Table, on OpenStep

This branch holds the same café website as [`main`](https://github.com/gaawai-l/cozy-coffee-table/tree/main), moved into OpenStep. We followed the public guide [Bring your existing code](https://docs.openstep.academy/cli/bring-your-code/) step by step, using the published CLI (`npm install -g openstep`, version 0.3.0).

- **Before** ([`main`](https://github.com/gaawai-l/cozy-coffee-table/tree/main)): Vite + React + TypeScript pages and an Express server. Bookings are kept in a JSON file, and emails go out through nodemailer.
- **After** (this branch): the folder as it looks once you have followed the guide.
- **Live site**: https://app-730e27ff-9a67-46f8-a0b1-f9f169f36ca1.openstep.academy
- **Every change in one view**: [compare `main` with `openstep`](https://github.com/gaawai-l/cozy-coffee-table/compare/main...openstep). Files that moved without changes show as renames, so the real edits stand out.

## What the platform now does for the site

| The original used | On OpenStep |
|---|---|
| `server/data/bookings.json` | The App's own database, a `bookings` table |
| nodemailer and an `SMTP_URL` | Platform email: a registered template sent with `sendEmail` |
| A hard-coded list of barista notes | AI: `invokeAI` writes the note of the day |
| No sign-in | Optional wallet sign-in with `useUser()` |
| Your own server and hosting | **Publish** builds the pages, runs the server, and puts both at the live address |

## The folder

```txt
apps/app/          the site (one App)
  src/             the café pages, plus the platform files in src/lib/
  functions/       the café server, plus the platform's server files
  migrations/      the database tables
server-packages/   the server's npm packages, bundled into functions/vendor.cjs
bookings.sql       the file given to `openstep data migrate`
emails.json        the template given to `openstep email templates register`
```

Only `apps/app/` goes to OpenStep. `server-packages/`, `bookings.sql` and `emails.json` sit outside it and stay on your computer. This branch also leaves out these local files: `openstep.config.json` (shown in step 4), the CLI's `.openstep/` folder, `node_modules/` and `dist/`.

## Step by step

Each heading below is a section of the guide.

### Install and sign in

```sh
npm install -g openstep
openstep --version
openstep login https://builder.openstep.academy
```

### 1. Create an agent for your site

```sh
openstep agent create "The Cozy Coffee Table"
openstep agent checkout <agent-id> ./cozy-coffee-table-openstep
cd cozy-coffee-table-openstep
openstep apps list
```

The café is one site, so it is one App with the key `app`, and all of its code goes into `apps/app/`.

### 2. Add a server

```sh
openstep capabilities enable server --app app
```

This creates `apps/app/functions/` with a starter server and the platform's server files. We ran it before copying the café server in, so the café's files go on top of the starter.

### 3. Move your code into the App

- **Pages.** We copied `src/App.tsx`, `src/api.ts`, `src/useApi.ts`, `src/index.css`, `src/components/*` and `public/favicon.svg` over the starter pages, unchanged.
  - We kept the App's own `package.json`, `vite.config.ts`, `tsconfig*.json` and the platform files in `src/lib/`, and added the two font packages with `npm install`.
  - The original's Vite proxy to port 3000 is gone: `openstep dev` sends `/api` to the server.
- **`index.html`.** The original page, plus the analytics line the guide asks you to keep: `<script defer referrerpolicy="same-origin" src="/_platform/analytics.js"></script>`.
- **`src/main.tsx`.** The App's version, which sets up the wallet providers, with the two font imports added.
- **Server.** `server/index.js` (ES modules) became `functions/server.js` (CommonJS), with the same routes. `server/cafe.js` became `functions/cafe.js`. The server no longer serves `dist/`, because the platform serves the pages, and it listens on `PORT`.
- **`.env.example`** stays out of the App. While it is in the folder, `openstep diff` stops with `Local source path refused: apps/app/.env.example (a secret-looking file; remove it and put its values in environment values)`. Its SMTP values are no longer needed anyway.
- **`functions/openapi.json`** now lists the café's 8 routes instead of the starter's `/api/info`. `npm run api:check` in `functions/` checks it.

**Bundle the server's npm packages.** Publish runs `functions/` without `npm install`, so express and zod go into one bundled file:

```sh
mkdir server-packages
cd server-packages
npm init -y
npm install express zod esbuild
```

`server-packages/index.js`:

```js
module.exports = { express: require('express'), z: require('zod').z };
```

```sh
npx esbuild index.js --bundle --platform=node --format=cjs --outfile=../apps/app/functions/vendor.cjs
cd ..
```

`functions/server.js` then takes them from the bundle with `const { express, z } = require('./vendor.cjs');`. nodemailer is no longer used, so it is not bundled.

**Database table.**

```sh
openstep data migrate 0002_add_bookings ./bookings.sql --app app
```

This applies the table to the App's development data and saves it as `apps/app/migrations/0002_add_bookings.sql`. `server/store.js` became `functions/bookings.js`, which reads and writes the table with `dataRequest`.

Guests book without signing in, so the server reads and writes bookings as one fixed address, the "booking desk", and the table's policies let in only that address. No page can read guests' email addresses. The staff page gets names, times and party sizes through `GET /api/bookings`.

### 4. Run it on your computer

`openstep.config.json` in the agent folder, which stays on your computer:

```json
{
  "apps": {
    "app": {
      "cwd": "apps/app",
      "frontend": { "command": ["npm", "run", "dev"], "port": 5173 },
      "backend": { "command": ["node", "functions/server.js"], "port": 8080 }
    }
  }
}
```

```sh
cd apps/app && npm install && cd ../..
openstep dev
```

`openstep dev` caught two things the live site would have broken, before anything was published:

- **The special's picture.** `TodaysSpecial.tsx` rendered `<img src="/api/specials/today.svg">` from React. `openstep dev` answered 404 and printed `openstep: GET /api/specials/today.svg was loaded as image, not by fetch or XHR, and got 404 as on the public live site. Build its URL with releaseRuntimePath('/api/specials/today.svg') from src/lib/runtime.` The fix is one line: `src={releaseRuntimePath('/api/specials/today.svg')}`.
- **The CSV download.** The route set `Content-Disposition`, which the live site drops, and the CLI warned about it. The route no longer sets it; the staff page names the file `bookings.csv` when it saves it.

### 5. Use OpenStep from your code

- **Email.** `server/mailer.js` is gone. Register the template in `emails.json` with `openstep email templates register emails.json --app app`; `POST /api/bookings` sends it with `sendEmail` from `functions/platform.js`.
- **AI.** `functions/note.js` asks `invokeAI` for the note of the day, with a JSON schema. It caches the answer for the day.
- **Wallet sign-in.** `src/components/AccountWidget.tsx` is new. It uses `useUser()` and RainbowKit's `ConnectButton`, and shows **Connect wallet**, then **Sign in**, then the signed-in address. Booking does not need it.

### 6. Push and publish

```sh
cd apps/app && npm run build && cd ../..
openstep diff
openstep push
openstep publish --note "First release"
```

The local `npm run build` is only a check; `dist/` is never pushed, because Publish builds the site itself. Before publishing, we built a candidate with `openstep stage` and checked it; the agent's owner then clicked **Publish** on the work page. `openstep publish` does the same from the terminal.

## File by file

| `main` | `openstep` | Change |
|---|---|---|
| `package.json`, `vite.config.ts`, `tsconfig*.json` | the App's own files | Kept the App's. Added only the two font packages. |
| `index.html` | `apps/app/index.html` | Added the platform analytics line. |
| `src/main.tsx` | `apps/app/src/main.tsx` | The App's version (wallet providers), plus the font imports. |
| `src/App.tsx`, `src/api.ts`, `src/useApi.ts`, most of `src/components/` | same names under `apps/app/` | Unchanged. |
| `src/components/TodaysSpecial.tsx` | same | The picture's URL uses `releaseRuntimePath()`. |
| `src/components/Header.tsx` | same | Shows the new account widget. |
| — | `apps/app/src/components/AccountWidget.tsx` | New: optional wallet sign-in. |
| `src/index.css` | same | Styles for the account widget. |
| `server/index.js` | `apps/app/functions/server.js` | CommonJS, same routes. Packages from `vendor.cjs`, email through `sendEmail`, no `Content-Disposition`, no `dist/` serving. |
| `server/cafe.js` | `apps/app/functions/cafe.js` | CommonJS. The hard-coded notes are gone. |
| — | `apps/app/functions/note.js` | New: the note of the day from `invokeAI`. |
| `server/store.js` | `apps/app/functions/bookings.js` | Bookings in the database through `dataRequest`. |
| `server/data/bookings.json` | `apps/app/migrations/0002_add_bookings.sql` | A table, created with `openstep data migrate`. |
| `server/mailer.js` | — | Removed: the platform sends email. |
| `.env.example` | — | Refused by the platform; no longer needed. |
| — | `apps/app/functions/vendor.cjs` | express and zod, bundled from `server-packages/`. |
| — | `apps/app/functions/openapi.json` | Lists the café's routes. |
| — | the rest of `apps/app/` | The App's platform files and starter components, kept as they came. |

## Good to know

- As in the original, the staff page at `#/staff` has no login. It never shows email addresses.
- Anyone can post a booking, and each booking sends one confirmation email. Emails and AI calls are charged in SSU to the agent's owner.
