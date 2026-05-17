# Gala Tracker

Polls a SPORTSYSTEMS live results site and serves swimmer results in real time.

## Architecture

```
Scheduled Function (every 5 min)
  → scrapes results site
  → writes to Firestore
       ↕ real-time listener (VueFire)
Static Vue app (Firebase Hosting)
```

- **No backend server** — just a scheduled function and a static frontend.
- **Scrape URL and tracked swimmers** live in Firestore (`config/scraper`) — update there, no redeploy needed.
- **Each gala** is isolated in its own subcollection (`galas/{galaId}/...`).
- **Frontend updates automatically** via VueFire's Firestore listeners — no refresh needed.

---

## Local Development

### 1. Prerequisites

```bash
npm install -g firebase-tools
npm install
cd functions && npm install && npm run build && cd ..
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
firebase emulators:start
```

| Service | URL |
|---|---|
| App (viewer) | http://localhost:5002 |
| Emulator UI | http://localhost:4000 |
| Firestore | http://localhost:8080 |
| Functions | http://localhost:5001 |

### 4. Seed the config document

Open the emulator UI (http://localhost:4000) and create:

- **Collection:** `config` / **Document ID:** `scraper`

| Field | Type | Example |
|---|---|---|
| `base_url` | string | `https://dcaswim.co.uk/live_results/sprint_relay/` |
| `tracked_swimmers` | array | `["SMITH", "JONES"]` |
| `current_gala_id` | string | `tasc-2026-01-25` |

### 5. Trigger the function manually

In the emulator UI → Functions → call `pollSwimResults`, or run:

```bash
curl -X POST http://127.0.0.1:5001/gala-tracker/us-central1/pollSwimResults
```

The Vue app at http://localhost:5002 will update in real time as data arrives.

---

## New Gala Setup

Update `config/scraper` in Firestore (no redeploy needed):

1. Set `base_url` to the new results URL
2. Set `current_gala_id` to a new unique ID (e.g. `tasc-2026-06-14`)
3. Optionally update `tracked_swimmers`

Old gala data stays archived under `galas/{old-id}`.

---

## Production Deployment

### 1. First-time setup

```bash
# Enable required APIs
firebase init firestore
firebase init functions
firebase init hosting
```

### 2. Deploy everything

```bash
npm run build           # build the Vue app to dist/
firebase deploy         # deploy hosting + functions + rules
```

### 3. Check the function is scheduled

Firebase console → Functions → `pollSwimResults` should show a schedule trigger of "every 5 minutes". You can test it immediately with **Run now** in the console.

---

## Firestore Structure

```
config/
  scraper          ← { base_url, tracked_swimmers, current_gala_id }

galas/
  {galaId}/        ← { last_updated, title, events, sessions, tracked_swimmers }
    results/
      {eventId}    ← { data: SwimResult[] }
    start_lists/
      {eventId}    ← { data: StartListEntry[] }
    tracked/
      {name}       ← { data: SwimResult[] }
```
