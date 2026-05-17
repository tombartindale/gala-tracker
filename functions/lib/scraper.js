"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollAll = pollAll;
const cheerio = __importStar(require("cheerio"));
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function fetchPage(url) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            return await res.text();
        }
        catch (e) {
            console.log(`Attempt ${attempt + 1} failed for ${url}: ${e.message}`);
            if (attempt < 2)
                await sleep(2000);
        }
    }
    return null;
}
async function parseNavigation(baseUrl) {
    const html = await fetchPage(baseUrl + 'before.htm');
    const events = {};
    const sessions = [];
    if (!html)
        return { resultEvents: [], startEvents: [], events, sessions };
    const $ = cheerio.load(html);
    const resultEvents = [];
    const startEvents = [];
    let currentSession = null;
    let currentSessionEvents = [];
    $('h3, tr').each((_, el) => {
        const tag = el.tagName.toLowerCase();
        if (tag === 'h3') {
            if (currentSession) {
                sessions.push(Object.assign({}, currentSession, { events: currentSessionEvents }));
                currentSessionEvents = [];
            }
            const text = $(el).text().replace(/\s+/g, ' ').trim();
            const m = text.match(/Session\s+(\d+)\s+(\d+\/\d+\/\d+)\s+at\s+(\d+:\d+)\s*(am|pm)?/i);
            if (m) {
                let timeStr = m[3];
                if ((m[4] || '').toLowerCase() === 'pm' && !timeStr.startsWith('12')) {
                    const [h, min] = timeStr.split(':');
                    timeStr = `${parseInt(h) + 12}:${min}`;
                }
                currentSession = { session_number: parseInt(m[1]), date: m[2], start_time: timeStr };
            }
        }
        else if (tag === 'tr') {
            const cells = $(el).find('td');
            if (cells.length < 3)
                return;
            const eventText = $(cells[0]).text().trim();
            if (!eventText || eventText.includes('EVENT'))
                return;
            cells.each((_, cell) => {
                const link = $(cell).find('a');
                if (!link.length)
                    return;
                const href = link.attr('href') || '';
                const m = href.match(/(\d+)\.HTM/i);
                if (!m)
                    return;
                const eventId = m[1];
                events[eventId] = eventText;
                if (currentSession && !currentSessionEvents.includes(eventId))
                    currentSessionEvents.push(eventId);
                if (href.toUpperCase().startsWith('R'))
                    resultEvents.push([eventId, eventText, href]);
                else if (href.toUpperCase().startsWith('S'))
                    startEvents.push([eventId, eventText, href]);
            });
        }
    });
    if (currentSession)
        sessions.push(Object.assign({}, currentSession, { events: currentSessionEvents }));
    return { resultEvents, startEvents, events, sessions };
}
async function parseResultsPage(baseUrl, eventId, eventName, url) {
    const html = await fetchPage(baseUrl + url);
    if (!html)
        return [];
    const $ = cheerio.load(html);
    const results = [];
    const timestamp = new Date().toISOString();
    let currentAgeGroup = 'Unknown';
    $('h3, table').each((_, el) => {
        const tag = el.tagName.toLowerCase();
        if (tag === 'h3') {
            const text = $(el).text().trim();
            if (text.includes('Age Group'))
                currentAgeGroup = text.replace(' - Full Results', '').trim();
        }
        else if (tag === 'table') {
            $(el).find('tr').each((_, row) => {
                const cells = $(row).find('td');
                if (cells.length < 6)
                    return;
                const place = $(cells[0]).text().trim().replace(/\.$/, '');
                const name = $(cells[1]).text().trim();
                if (!name || name === 'Name')
                    return;
                const age = cells.length > 2 ? $(cells[2]).text().trim() : '';
                const club = cells.length > 3 ? $(cells[3]).text().trim() : '';
                const time = cells.length > 5 ? $(cells[5]).text().trim() : '';
                const wa_points = cells.length > 8 ? $(cells[8]).text().trim() : '';
                const split_50 = cells.length > 10 ? $(cells[10]).text().trim() : '';
                if (name && (place || time))
                    results.push({ event_id: eventId, event_name: eventName, age_group: currentAgeGroup, place, name, age, club, time, wa_points, split_50, timestamp });
            });
        }
    });
    return results;
}
async function parseStartListPage(baseUrl, eventId, eventName, url) {
    const html = await fetchPage(baseUrl + url);
    if (!html)
        return [];
    const $ = cheerio.load(html);
    const entries = [];
    const timestamp = new Date().toISOString();
    let currentHeat = '1';
    $('table').each((_, table) => {
        $(table).find('tr').each((_, row) => {
            const cells = $(row).find('td');
            if (cells.length === 1) {
                const m = $(cells[0]).text().trim().match(/Heat\s*(?:Number\s*-?\s*)?(\d+)/i);
                if (m)
                    currentHeat = m[1];
                return;
            }
            if (cells.length < 6)
                return;
            const lane = $(cells[0]).text().trim();
            if (lane === 'Lane' || !lane)
                return;
            const name = $(cells[2]).text().trim();
            if (!name)
                return;
            entries.push({ event_id: eventId, event_name: eventName, heat: currentHeat, lane, name, age: $(cells[3]).text().trim(), club: $(cells[4]).text().trim(), seed_time: $(cells[5]).text().trim(), timestamp });
        });
    });
    return entries;
}
async function pollAll(currentData, baseUrl) {
    const { resultEvents, startEvents, events, sessions } = await parseNavigation(baseUrl);
    const allResults = { ...(currentData.all_results || {}) };
    const startLists = { ...(currentData.start_lists || {}) };
    const trackedResults = { ...(currentData.tracked_results || {}) };
    const trackedNames = currentData.tracked_swimmers || [];
    for (const [eventId, eventName, url] of resultEvents) {
        const results = await parseResultsPage(baseUrl, eventId, eventName, url);
        if (results.length) {
            allResults[eventId] = results;
            for (const result of results) {
                const nameUpper = result.name.toUpperCase();
                if (trackedNames.some(t => t.includes(nameUpper) || nameUpper.includes(t))) {
                    if (!trackedResults[nameUpper])
                        trackedResults[nameUpper] = [];
                    const dup = trackedResults[nameUpper].some(r => r.event_id === result.event_id && r.time === result.time);
                    if (!dup)
                        trackedResults[nameUpper].push(result);
                }
            }
        }
    }
    for (const [eventId, eventName, url] of startEvents) {
        const entries = await parseStartListPage(baseUrl, eventId, eventName, url);
        if (entries.length)
            startLists[eventId] = entries;
    }
    return {
        last_updated: new Date().toISOString(),
        tracked_swimmers: trackedNames,
        events, sessions,
        all_results: allResults,
        start_lists: startLists,
        tracked_results: trackedResults,
    };
}
//# sourceMappingURL=scraper.js.map