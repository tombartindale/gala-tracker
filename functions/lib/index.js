"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollSwimResultsHttp = exports.pollSwimResults = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const scraper_1 = require("./scraper");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
// Returns today's date as dd/mm/yyyy in Europe/London time
function todayLondon() {
    return new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London" });
}
async function pollGala(gala_id, base_url) {
    const [meta, results, startLists] = await Promise.all([
        db.doc(`galas/${gala_id}`).get(),
        db.collection(`galas/${gala_id}/results`).get(),
        db.collection(`galas/${gala_id}/start_lists`).get(),
    ]);
    const all_results = {};
    const start_lists = {};
    results.forEach((d) => {
        all_results[d.id] = d.data().data;
    });
    startLists.forEach((d) => {
        start_lists[d.id] = d.data().data;
    });
    const current = meta.exists
        ? { ...meta.data(), all_results, start_lists }
        : {};
    const updated = await (0, scraper_1.pollAll)(current, base_url);
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
    console.log(`Polled ${Object.keys(updated.all_results).length} events → galas/${gala_id}`);
    return Object.keys(updated.all_results).length;
}
async function runPoll() {
    const configSnap = await db.doc("config/scraper").get();
    if (!configSnap.exists)
        throw new Error("No config/scraper document found");
    const { galas } = configSnap.data();
    const today = todayLondon();
    const active = galas.filter((g) => g.race_dates.includes(today));
    if (!active.length) {
        console.log(`No galas scheduled for today (${today})`);
        return { skipped: true, date: today };
    }
    const results = await Promise.allSettled(active.map((g) => pollGala(g.gala_id, g.base_url)));
    const summary = active.map((g, i) => {
        const r = results[i];
        if (r.status === "fulfilled")
            return { gala: g.gala_id, events: r.value };
        console.error(`Failed to poll galas/${g.gala_id}:`, r.reason);
        return { gala: g.gala_id, error: String(r.reason) };
    });
    console.log(`Poll complete for ${today}:`, JSON.stringify(summary));
    return { date: today, galas: summary };
}
// Production: runs on schedule
exports.pollSwimResults = (0, scheduler_1.onSchedule)({ schedule: "every 5 minutes", timeZone: "Europe/London", region: "europe-west2" }, async () => {
    await runPoll();
});
// Dev: callable via HTTP so the emulator can trigger it without Pub/Sub
exports.pollSwimResultsHttp = (0, https_1.onRequest)(async (_req, res) => {
    try {
        const result = await runPoll();
        res.json({ ok: true, ...result });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
//# sourceMappingURL=index.js.map