import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'

initializeApp({ projectId: 'gala-tracker' })
const db = getFirestore()

await db.doc('config/scraper').set({
  base_url: 'https://dcaswim.co.uk/live_results/sprint_relay/',
  tracked_swimmers: [],
  current_gala_id: 'gala-2026-01-25',
})

console.log('Seeded config/scraper')
console.log('Edit scripts/seed.js to change the base_url or gala ID before running.')
process.exit(0)
