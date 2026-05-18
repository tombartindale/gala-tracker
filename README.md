# Gala Tracker

Polls a SPORTSYSTEMS live results site and serves swimmer results in real time.

## Architecture

```
Scheduled Function (every 5 min)
  → scrapes results site for each active gala
  → writes to Firestore
       ↕ real-time listener (VueFire)
Static Vue app (Firebase Hosting)
```

- **No backend server** — just a scheduled function and a static frontend.
- **Galas and scrape URLs** live in Firestore (`config/scraper`) — add or update galas without redeploying.
- **Each gala** is isolated in its own subcollection (`galas/{galaId}/...`).
- **Frontend updates automatically** via VueFire's Firestore listeners — no refresh needed.
- **Multiple galas** are supported simultaneously; the app shows a nav bar and auto-selects today's gala based on `race_dates`.

---

## App Features

- **Swimmer search** — type a name (or partial name) with autocomplete suggestions
- **Club filter** — dropdown to browse all swimmers from a club
- **Club summary view** — medal tally, race count, and upcoming races for a whole club
- **Heat strip** — live scrolling strip showing current and upcoming heats with estimated start times
- **Historical gala browsing** — switch between past galas via the nav bar
- **Shareable URLs** — `/swimmer/:name`, `/club/:club`, `/gala/:galaId/swimmer/:name`, etc.

---

## Local Development

### 1. Prerequisites

```bash
npm install -g firebase-tools
npm install
cd functions && npm install && cd ..
```

### 2. Add your Firebase config to `.env.local`

Get these values from the Firebase console → Project settings → Your apps → Web app:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=gala-tracker.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=gala-tracker
VITE_FIREBASE_STORAGE_BUCKET=gala-tracker.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 3. Start the emulators

```bash
npm run emulate
```

This builds the functions, then starts the emulators with data import/export from `./emulator-data`.

| Service | URL |
|---|---|
| App (viewer) | http://localhost:5002 |
| Emulator UI | http://localhost:4000 |
| Firestore | http://localhost:8080 |
| Functions | http://localhost:5001 |

### 4. Seed galas into Firestore

Edit `scripts/seed.js` to list your galas, then run:

```bash
node --experimental-vm-modules scripts/seed.js
```

The seed script writes a single document to `config/scraper` with a `galas` array. Each entry needs:

| Field | Type | Description |
|---|---|---|
| `gala_id` | string | Unique slug, e.g. `tasc-2026-06-14` |
| `base_url` | string | URL of the SPORTSYSTEMS results page |
| `race_dates` | string[] | Dates in `dd/mm/yyyy` format — used to auto-select today's gala |

Example `scripts/seed.js`:

```js
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

initializeApp({ projectId: "gala-tracker" });
const db = getFirestore();

await db.doc("config/scraper").set({
  galas: [
    {
      gala_id: "tasc-2026-06-14",
      base_url: "https://example.com/live_results/june-gala/",
      race_dates: ["14/06/2026"],
    },
  ],
});

process.exit(0);
```

> **Tip:** `race_dates` can contain multiple dates for multi-day galas. The app will show the gala nav bar and auto-select today's gala whenever the current date matches one of the entries.

### 5. Trigger the scraper manually

```bash
npm run poll
```

Or call the HTTP endpoint directly:

```bash
curl -X POST http://127.0.0.1:5001/gala-tracker/us-central1/pollSwimResultsHttp
```

The Vue app at http://localhost:5002 will update in real time as data arrives.

---

## Adding a New Gala (Production)

Update `config/scraper` in the Firebase console (no redeploy needed):

1. Add a new entry to the `galas` array with a unique `gala_id`, the `base_url`, and the `race_dates`
2. Old gala data stays archived under `galas/{old-id}` — the nav bar will show all galas that have been scraped

Alternatively, re-run the seed script against production (remove the `FIRESTORE_EMULATOR_HOST` line first and ensure you're authenticated with `firebase login`).

---

## Production Deployment

### 1. First-time setup

```bash
firebase init firestore
firebase init functions
firebase init hosting
```

### 2. Deploy everything

```bash
npm run build           # build the Vue app to dist/
firebase deploy         # deploy hosting + functions + rules
```

### 3. Seed the config document

Run `scripts/seed.js` against production (without the emulator env var) or create the `config/scraper` document manually in the Firebase console.

### 4. Check the function is scheduled

Firebase console → Functions → `pollSwimResults` should show a schedule trigger of "every 5 minutes". You can test it immediately with **Run now** in the console.

---

## Firestore Structure

```
config/
  scraper    ← { galas: [{ gala_id, base_url, race_dates[] }] }

galas/
  {galaId}/  ← { last_updated, title, events, sessions }
    results/
      {eventId}     ← { data: SwimResult[] }
    start_lists/
      {eventId}     ← { data: StartListEntry[] }
```

### `config/scraper`

| Field | Type | Description |
|---|---|---|
| `galas` | array | List of gala configs (see below) |
| `galas[].gala_id` | string | Unique gala identifier |
| `galas[].base_url` | string | SPORTSYSTEMS results base URL |
| `galas[].race_dates` | string[] | Race dates as `dd/mm/yyyy` |

### `galas/{galaId}`

| Field | Type | Description |
|---|---|---|
| `title` | string | Gala title scraped from the results page |
| `last_updated` | string | ISO timestamp of last successful scrape |
| `events` | map | `{ eventId: eventName }` |
| `sessions` | array | Session schedule with date, start time, and event list |
| `warmup_mins` | number | _(optional)_ Warmup duration in minutes before racing starts (default: 90) |
