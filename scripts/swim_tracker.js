#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "fs";
import { program } from "commander";
import * as cheerio from "cheerio";

// const BASE_URL = 'http://liveresults.tynemouthasc.co.uk/live/';
const BASE_URL = "https://dcaswim.co.uk/live_results/sprint_relay/";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class SwimTracker {
  constructor(trackedNames, resultsFile = "swim_results.json") {
    this.trackedNames = trackedNames.map((n) => n.toUpperCase());
    this.resultsFile = resultsFile;
    this.allResults = {}; // event_id -> result[]
    this.startLists = {}; // event_id -> entry[]
    this.trackedResults = {}; // swimmer_name -> result[]
    this.events = {}; // event_id -> event_name
    this.sessions = [];
    this.loadResults();
  }

  loadResults() {
    if (!existsSync(this.resultsFile)) return;
    try {
      const data = JSON.parse(readFileSync(this.resultsFile, "utf8"));
      this.allResults = data.all_results || {};
      this.startLists = data.start_lists || {};
      this.trackedResults = data.tracked_results || {};
      this.events = data.events || {};
      this.sessions = data.sessions || [];
      console.log(
        `Loaded ${Object.keys(this.allResults).length} events from ${this.resultsFile}`,
      );
    } catch (e) {
      console.error(`Error loading results: ${e.message}`);
    }
  }

  saveResults() {
    const data = {
      last_updated: new Date().toISOString(),
      tracked_swimmers: this.trackedNames,
      events: this.events,
      sessions: this.sessions,
      all_results: this.allResults,
      start_lists: this.startLists,
      tracked_results: this.trackedResults,
    };
    writeFileSync(this.resultsFile, JSON.stringify(data, null, 2));
  }

  async fetchPage(url) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          headers: HEADERS,
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch (e) {
        console.log(`Attempt ${attempt + 1} failed for ${url}: ${e.message}`);
        if (attempt < 2) await sleep(2000);
      }
    }
    return null;
  }

  async parseNavigation() {
    const html = await this.fetchPage(BASE_URL + "before.htm");
    if (!html) return [[], []];

    const $ = cheerio.load(html);
    const results = [];
    const startLists = [];
    this.sessions = [];

    let currentSession = null;
    let currentSessionEvents = [];

    $("h3, tr").each((_, el) => {
      const tag = el.tagName.toLowerCase();

      if (tag === "h3") {
        if (currentSession) {
          this.sessions.push({
            ...currentSession,
            events: currentSessionEvents,
          });
          currentSessionEvents = [];
        }

        const text = $(el).text().replace(/\s+/g, " ").trim();
        const m = text.match(
          /Session\s+(\d+)\s+(\d+\/\d+\/\d+)\s+at\s+(\d+:\d+)\s*(am|pm)?/i,
        );
        if (m) {
          let timeStr = m[3];
          const ampm = (m[4] || "").toLowerCase();
          if (ampm === "pm" && !timeStr.startsWith("12")) {
            const [h, min] = timeStr.split(":");
            timeStr = `${parseInt(h) + 12}:${min}`;
          }
          currentSession = {
            session_number: parseInt(m[1]),
            date: m[2],
            start_time: timeStr,
          };
          console.log(`  Found Session ${m[1]}: ${m[2]} at ${timeStr}`);
        }
      } else if (tag === "tr") {
        const cells = $(el).find("td");
        if (cells.length < 3) return;

        const eventText = $(cells[0]).text().trim();
        if (!eventText || eventText.includes("EVENT")) return;

        cells.each((_, cell) => {
          const link = $(cell).find("a");
          if (!link.length) return;
          const href = link.attr("href") || "";
          const m = href.match(/(\d+)\.HTM/i);
          if (!m) return;

          const eventId = m[1];
          this.events[eventId] = eventText;

          if (currentSession && !currentSessionEvents.includes(eventId)) {
            currentSessionEvents.push(eventId);
          }

          if (href.toUpperCase().startsWith("R")) {
            results.push([eventId, eventText, href]);
          } else if (href.toUpperCase().startsWith("S")) {
            startLists.push([eventId, eventText, href]);
          }
        });
      }
    });

    if (currentSession) {
      this.sessions.push({ ...currentSession, events: currentSessionEvents });
    }

    console.log(`  Found ${this.sessions.length} sessions`);
    return [results, startLists];
  }

  async parseResultsPage(eventId, eventName, url) {
    const html = await this.fetchPage(BASE_URL + url);
    if (!html) return [];

    const $ = cheerio.load(html);
    const results = [];
    const timestamp = new Date().toISOString();
    let currentAgeGroup = "Unknown";

    $("h3, table").each((_, el) => {
      const tag = el.tagName.toLowerCase();

      if (tag === "h3") {
        const text = $(el).text().trim();
        if (text.includes("Age Group")) {
          currentAgeGroup = text.replace(" - Full Results", "").trim();
        }
      } else if (tag === "table") {
        $(el)
          .find("tr")
          .each((_, row) => {
            const cells = $(row).find("td");
            if (cells.length < 6) return;

            const place = $(cells[0]).text().trim().replace(/\.$/, "");
            const name = $(cells[1]).text().trim();
            if (!name || name === "Name") return;

            const age = cells.length > 2 ? $(cells[2]).text().trim() : "";
            const club = cells.length > 3 ? $(cells[3]).text().trim() : "";
            const time = cells.length > 5 ? $(cells[5]).text().trim() : "";
            const waPoints = cells.length > 8 ? $(cells[8]).text().trim() : "";
            const split50 = cells.length > 10 ? $(cells[10]).text().trim() : "";

            if (name && (place || time)) {
              results.push({
                event_id: eventId,
                event_name: eventName,
                age_group: currentAgeGroup,
                place,
                name,
                age,
                club,
                time,
                wa_points: waPoints,
                split_50: split50,
                timestamp,
              });
            }
          });
      }
    });

    return results;
  }

  async parseStartListPage(eventId, eventName, url) {
    const html = await this.fetchPage(BASE_URL + url);
    if (!html) return [];

    const $ = cheerio.load(html);
    const entries = [];
    const timestamp = new Date().toISOString();
    let currentHeat = "1";

    $("table").each((_, table) => {
      $(table)
        .find("tr")
        .each((_, row) => {
          const cells = $(row).find("td");

          if (cells.length === 1) {
            const text = $(cells[0]).text().trim();
            const m = text.match(/Heat\s*(?:Number\s*-?\s*)?(\d+)/i);
            if (m) currentHeat = m[1];
            return;
          }

          if (cells.length < 6) return;

          const lane = $(cells[0]).text().trim();
          if (lane === "Lane" || !lane) return;

          const name = $(cells[2]).text().trim();
          if (!name) return;

          const age = $(cells[3]).text().trim();
          const club = $(cells[4]).text().trim();
          const seedTime = $(cells[5]).text().trim();

          entries.push({
            event_id: eventId,
            event_name: eventName,
            heat: currentHeat,
            lane,
            name,
            age,
            club,
            seed_time: seedTime,
            timestamp,
          });
        });
    });

    return entries;
  }

  async parseLiveResults() {
    const html = await this.fetchPage(BASE_URL + "lastresult.htm");
    if (!html) return [];

    const $ = cheerio.load(html);
    const results = [];
    const timestamp = new Date().toISOString();

    const eventHeader = $("h4").first();
    const eventName = eventHeader.length
      ? eventHeader.text().trim()
      : "Live Event";
    const m = eventName.match(/EVENT\s+(\d+)/);
    const eventId = m ? `live_${m[1]}` : "live";

    $("table").each((_, table) => {
      $(table)
        .find("tr")
        .each((_, row) => {
          const cells = $(row).find("td");
          if (cells.length < 4) return;

          const place = $(cells[0]).text().trim();
          const name = $(cells[1]).text().trim();
          const club = $(cells[2]).text().trim();
          const time = $(cells[3]).text().trim();

          if (name && name !== "Name" && time) {
            results.push({
              event_id: eventId,
              event_name: eventName,
              age_group: "Live",
              place,
              name,
              age: "",
              club,
              time,
              wa_points: "",
              split_50: "",
              timestamp,
            });
          }
        });
    });

    return results;
  }

  isTrackedSwimmer(name) {
    const upper = name.toUpperCase();
    return this.trackedNames.some(
      (t) => t.includes(upper) || upper.includes(t),
    );
  }

  updateTrackedResults(results) {
    for (const result of results) {
      if (!this.isTrackedSwimmer(result.name)) continue;

      const key = result.name.toUpperCase();
      if (!this.trackedResults[key]) this.trackedResults[key] = [];

      const duplicate = this.trackedResults[key].some(
        (r) => r.event_id === result.event_id && r.time === result.time,
      );
      if (!duplicate) {
        this.trackedResults[key].push(result);
        console.log(`\n*** TRACKED SWIMMER ALERT ***`);
        console.log(`    ${result.name} - ${result.event_name}`);
        console.log(`    Place: ${result.place}, Time: ${result.time}`);
        console.log(
          `    Age Group: ${result.age_group}, Club: ${result.club}\n`,
        );
      }
    }
  }

  async pollAllResults() {
    const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
    console.log(`\n[${time}] Polling all results...`);

    const [resultEvents, startEvents] = await this.parseNavigation();
    console.log(
      `Found ${resultEvents.length} result pages, ${startEvents.length} start lists`,
    );

    for (const [eventId, eventName, url] of resultEvents) {
      const results = await this.parseResultsPage(eventId, eventName, url);
      if (results.length) {
        this.allResults[eventId] = results;
        this.updateTrackedResults(results);
        console.log(`  Event ${eventId}: ${results.length} results`);
      }
    }

    for (const [eventId, eventName, url] of startEvents) {
      const entries = await this.parseStartListPage(eventId, eventName, url);
      if (entries.length) {
        this.startLists[eventId] = entries;
      }
    }

    const totalEntries = Object.values(this.startLists).reduce(
      (sum, v) => sum + v.length,
      0,
    );
    console.log(`  Loaded ${totalEntries} start list entries`);
    this.saveResults();
  }

  async pollLiveResults() {
    const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
    process.stdout.write(`[${time}] Checking live results... `);

    const results = await this.parseLiveResults();
    if (results.length) {
      console.log(`${results.length} swimmers`);
      this.updateTrackedResults(results);
      this.saveResults();
    } else {
      console.log("no results");
    }
  }

  printTrackedSummary() {
    console.log("\n" + "=".repeat(60));
    console.log("TRACKED SWIMMER SUMMARY");
    console.log("=".repeat(60));

    if (!Object.keys(this.trackedResults).length) {
      console.log("No results yet for tracked swimmers");
      return;
    }

    for (const [name, results] of Object.entries(this.trackedResults)) {
      console.log(`\n${name}:`);
      const sorted = [...results].sort((a, b) =>
        a.event_id > b.event_id ? 1 : -1,
      );
      for (const r of sorted) {
        console.log(`  Event ${r.event_id}: ${r.event_name}`);
        console.log(
          `    Place: ${r.place}, Time: ${r.time}, Age Group: ${r.age_group}`,
        );
      }
    }
  }

  printAllResultsSummary() {
    console.log("\n" + "=".repeat(60));
    console.log("ALL RESULTS SUMMARY");
    console.log("=".repeat(60));

    const sortedIds = Object.keys(this.allResults).sort((a, b) => {
      const aNum = parseInt(a) || 999;
      const bNum = parseInt(b) || 999;
      return aNum - bNum;
    });

    for (const eventId of sortedIds) {
      const results = this.allResults[eventId];
      const eventName = this.events[eventId] || "Unknown Event";
      console.log(`\nEvent ${eventId}: ${eventName}`);
      console.log(`  ${results.length} swimmers`);
    }
  }

  async run(pollInterval = 30, fullRefreshInterval = 300) {
    console.log("Starting swim tracker...");
    console.log(
      `Tracking swimmers: ${this.trackedNames.join(", ") || "(all)"}`,
    );
    console.log(
      `Poll interval: ${pollInterval}s, Full refresh: ${fullRefreshInterval}s`,
    );
    console.log(`Results saved to: ${this.resultsFile}`);
    console.log("-".repeat(60));

    let lastFullPoll = 0;

    const tick = async () => {
      const now = Date.now() / 1000;
      if (now - lastFullPoll >= fullRefreshInterval) {
        await this.pollAllResults();
        this.printTrackedSummary();
        lastFullPoll = Date.now() / 1000;
      } else {
        await this.pollLiveResults();
      }
    };

    process.on("SIGINT", () => {
      console.log("\n\nStopping tracker...");
      this.printTrackedSummary();
      this.saveResults();
      console.log("Results saved. Goodbye!");
      process.exit(0);
    });

    while (true) {
      await tick();
      await sleep(pollInterval * 1000);
    }
  }
}

program
  .name("swim_tracker")
  .description("Track swimming competition results")
  .argument(
    "[swimmers...]",
    'Names of swimmers to track (e.g. SMITH "John JONES")',
  )
  .option("-i, --interval <seconds>", "Polling interval in seconds", "30")
  .option(
    "-f, --full-refresh <seconds>",
    "Full refresh interval in seconds",
    "300",
  )
  .option("-o, --output <file>", "Output file for results", "swim_results.json")
  .option("--once", "Run once and exit (no continuous polling)")
  .option("--summary", "Print results summary and exit")
  .action(async (swimmers, opts) => {
    const tracker = new SwimTracker(swimmers, opts.output);

    if (opts.summary) {
      tracker.printTrackedSummary();
      tracker.printAllResultsSummary();
      return;
    }

    if (opts.once) {
      await tracker.pollAllResults();
      tracker.printTrackedSummary();
    } else {
      await tracker.run(parseInt(opts.interval), parseInt(opts.fullRefresh));
    }
  });

program.parse();
