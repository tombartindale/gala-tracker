import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { pollAll } from './scraper'

initializeApp()
const db = getFirestore()

async function runPoll() {
  const configSnap = await db.doc('config/scraper').get()
  if (!configSnap.exists) {
    throw new Error('No config/scraper document found')
  }

  const { base_url, tracked_swimmers, current_gala_id } = configSnap.data() as {
    base_url: string
    tracked_swimmers: string[]
    current_gala_id: string
  }

  const [meta, results, startLists, tracked] = await Promise.all([
    db.doc(`galas/${current_gala_id}`).get(),
    db.collection(`galas/${current_gala_id}/results`).get(),
    db.collection(`galas/${current_gala_id}/start_lists`).get(),
    db.collection(`galas/${current_gala_id}/tracked`).get(),
  ])

  const all_results: Record<string, any[]> = {}
  const start_lists: Record<string, any[]> = {}
  const tracked_results: Record<string, any[]> = {}
  results.forEach(d => { all_results[d.id] = d.data().data })
  startLists.forEach(d => { start_lists[d.id] = d.data().data })
  tracked.forEach(d => { tracked_results[d.id] = d.data().data })

  const current = meta.exists
    ? { ...meta.data(), all_results, start_lists, tracked_results }
    : {}

  const updated = await pollAll({ ...current, tracked_swimmers }, base_url)

  const batch = db.batch()
  batch.set(db.doc(`galas/${current_gala_id}`), {
    last_updated: updated.last_updated,
    tracked_swimmers: updated.tracked_swimmers,
    events: updated.events,
    sessions: updated.sessions,
    title: meta.data()?.title || current_gala_id,
  })
  for (const [id, v] of Object.entries(updated.all_results)) {
    batch.set(db.collection(`galas/${current_gala_id}/results`).doc(id), { data: v })
  }
  for (const [id, v] of Object.entries(updated.start_lists)) {
    batch.set(db.collection(`galas/${current_gala_id}/start_lists`).doc(id), { data: v })
  }
  for (const [id, v] of Object.entries(updated.tracked_results)) {
    batch.set(db.collection(`galas/${current_gala_id}/tracked`).doc(id), { data: v })
  }
  await batch.commit()

  console.log(`Polled ${Object.keys(updated.all_results).length} events → galas/${current_gala_id}`)
  return { events: Object.keys(updated.all_results).length, gala: current_gala_id }
}

// Production: runs on schedule
export const pollSwimResults = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'Europe/London' },
  async () => { await runPoll() }
)

// Dev: callable via HTTP so the emulator can trigger it without Pub/Sub
export const pollSwimResultsHttp = onRequest(async (_req, res) => {
  try {
    const result = await runPoll()
    res.json({ ok: true, ...result })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})
