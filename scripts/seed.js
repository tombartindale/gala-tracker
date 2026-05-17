import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

initializeApp({ projectId: "gala-tracker" });
const db = getFirestore();

await db.doc("config/scraper").set({
  galas: [
    {
      gala_id: "gala-2026-01-25",
      base_url: "https://dcaswim.co.uk/live_results/sprint_relay/",
      race_dates: ["17/05/2026"],
    },
    {
      gala_id: "shrimp-may-2026",
      base_url: "https://newcastleswimteam.co.uk/live-results/shrimp-may-2026/",
      race_dates: ["17/05/2026"],
    },
  ],
});

console.log("Seeded config/scraper");
console.log(
  "Edit scripts/seed.js to add galas and race_dates (dd/mm/yyyy) before running.",
);
process.exit(0);
