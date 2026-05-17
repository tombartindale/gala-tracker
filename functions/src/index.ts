import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { pollAll } from "./scraper";

initializeApp();
const db = getFirestore();

interface GalaConfig {
  gala_id: string;
  base_url: string;
  // dd/mm/yyyy strings matching the date format on the results pages
  race_dates: string[];
}

// Returns today's date as dd/mm/yyyy in Europe/London time
function todayLondon(): string {
  return new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London" });
}

async function pollGala(gala_id: string, base_url: string) {
  const [meta, results, startLists] = await Promise.all([
    db.doc(`galas/${gala_id}`).get(),
    db.collection(`galas/${gala_id}/results`).get(),
    db.collection(`galas/${gala_id}/start_lists`).get(),
  ]);

  const all_results: Record<string, any[]> = {};
  const start_lists: Record<string, any[]> = {};
  results.forEach((d) => {
    all_results[d.id] = d.data().data;
  });
  startLists.forEach((d) => {
    start_lists[d.id] = d.data().data;
  });

  const current = meta.exists
    ? { ...meta.data(), all_results, start_lists }
    : {};

  const updated = await pollAll(current, base_url);

  const batch = db.batch();
  batch.set(db.doc(`galas/${gala_id}`), {
    last_updated: updated.last_updated,
    events: updated.events,
    sessions: updated.sessions,
    title: updated.title || meta.data()?.title || gala_id,
  });
  for (const [id, v] of Object.entries(updated.all_results)) {
    batch.set(db.collection(`galas/${gala_id}/results`).doc(id), { data: v });
  }
  for (const [id, v] of Object.entries(updated.start_lists)) {
    batch.set(db.collection(`galas/${gala_id}/start_lists`).doc(id), {
      data: v,
    });
  }
  await batch.commit();

  console.log(
    `Polled ${Object.keys(updated.all_results).length} events → galas/${gala_id}`,
  );
  return Object.keys(updated.all_results).length;
}

async function runPoll() {
  const configSnap = await db.doc("config/scraper").get();
  if (!configSnap.exists) throw new Error("No config/scraper document found");

  const { galas } = configSnap.data() as { galas: GalaConfig[] };

  const today = todayLondon();
  const active = galas.filter((g) => g.race_dates.includes(today));

  if (!active.length) {
    console.log(`No galas scheduled for today (${today})`);
    return { skipped: true, date: today };
  }

  const results = await Promise.allSettled(
    active.map((g) => pollGala(g.gala_id, g.base_url)),
  );

  const summary = active.map((g, i) => {
    const r = results[i];
    if (r.status === "fulfilled") return { gala: g.gala_id, events: r.value };
    console.error(`Failed to poll galas/${g.gala_id}:`, r.reason);
    return { gala: g.gala_id, error: String(r.reason) };
  });

  console.log(`Poll complete for ${today}:`, JSON.stringify(summary));
  return { date: today, galas: summary };
}

// Production: runs on schedule
export const pollSwimResults = onSchedule(
  { schedule: "every 5 minutes", timeZone: "Europe/London", region: "europe-west2" },
  async () => {
    await runPoll();
  },
);

// Dev: callable via HTTP so the emulator can trigger it without Pub/Sub
export const pollSwimResultsHttp = onRequest(async (_req, res) => {
  try {
    const result = await runPoll();
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
