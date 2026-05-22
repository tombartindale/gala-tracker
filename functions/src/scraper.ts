import * as cheerio from 'cheerio'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

export interface SwimResult {
  event_id: string; event_name: string; age_group: string; place: string
  name: string; age: string; club: string; time: string; wa_points: string
  split_50: string; timestamp: string
}

export interface StartListEntry {
  event_id: string; event_name: string; heat: string; lane: string
  name: string; age: string; club: string; seed_time: string; timestamp: string
}

export interface Session {
  session_number: number; date: string; start_time: string; events: string[]
}

export interface SwimData {
  last_updated: string; events: Record<string, string>
  sessions: Session[]; all_results: Record<string, SwimResult[]>
  start_lists: Record<string, StartListEntry[]>; title: string
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function fetchPage(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (e: any) {
      console.log(`Attempt ${attempt + 1} failed for ${url}: ${e.message}`)
      if (attempt < 2) await sleep(2000)
    }
  }
  return null
}

async function parseNavigation(baseUrl: string) {
  const html = await fetchPage(baseUrl + 'before.htm')
  const events: Record<string, string> = {}
  const sessions: Session[] = []
  if (!html) return { resultEvents: [] as [string,string,string][], startEvents: [] as [string,string,string][], events, sessions, title: '' }

  const $ = cheerio.load(html)
  const title = $('h2').filter((_, el) => $(el).text().trim() !== '').first().text().trim() || $('title').first().text().trim()
  const resultEvents: [string, string, string][] = []
  const startEvents: [string, string, string][] = []
  let currentSession: Omit<Session, 'events'> | null = null
  let currentSessionEvents: string[] = []

  $('h3, tr').each((_, el) => {
    const tag = el.tagName.toLowerCase()
    if (tag === 'h3') {
      if (currentSession) { sessions.push(Object.assign({}, currentSession, { events: currentSessionEvents })); currentSessionEvents = [] }
      const text = $(el).text().replace(/\s+/g, ' ').trim()
const m = text.match(/Session\s+(\d+?)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+at\s+(\d+:\d+)\s*(am|pm)?/i)
      if (m) {
        let timeStr = m[3]
        if ((m[4] || '').toLowerCase() === 'pm' && !timeStr.startsWith('12')) {
          const [h, min] = timeStr.split(':'); timeStr = `${parseInt(h) + 12}:${min}`
        }
        currentSession = { session_number: parseInt(m[1]), date: m[2], start_time: timeStr }
      }
    } else if (tag === 'tr') {
      const cells = $(el).find('td')
      if (cells.length < 3) return
      const eventText = $(cells[0]).text().trim()
      if (!eventText || eventText.includes('EVENT')) return
      cells.each((_, cell) => {
        const link = $(cell).find('a')
        if (!link.length) return
        const href = link.attr('href') || ''
        const m = href.match(/(\d+)\.HTM/i)
        if (!m) return
        const eventId = m[1]
        events[eventId] = eventText
        if (currentSession && !currentSessionEvents.includes(eventId)) currentSessionEvents.push(eventId)
        if (href.toUpperCase().startsWith('R')) resultEvents.push([eventId, eventText, href])
        else if (href.toUpperCase().startsWith('S')) startEvents.push([eventId, eventText, href])
      })
    }
  })
  if (currentSession) sessions.push(Object.assign({}, currentSession, { events: currentSessionEvents }))

  // Look for a draft programme PDF link
  let draftPdfUrl: string | null = null
  $('a').each((_, el) => {
    const href = $(el).attr('href') || ''
    const text = $(el).text().toLowerCase()
    if (href.toLowerCase().endsWith('.pdf') && text.includes('draft')) draftPdfUrl = href
  })

  return { resultEvents, startEvents, events, sessions, title, draftPdfUrl }
}

async function parseDraftProgramme(
  baseUrl: string,
  pdfUrl: string,
  events: Record<string, string>
): Promise<Record<string, StartListEntry[]>> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require('pdf-parse')
  const res = await fetch(baseUrl + pdfUrl, { headers: HEADERS, signal: AbortSignal.timeout(30000) })
  if (!res.ok) return {}
  const buf = Buffer.from(await res.arrayBuffer())
  const { text } = await pdfParse(buf)

  const result: Record<string, StartListEntry[]> = {}
  const timestamp = new Date().toISOString()
  let currentEventId = ''
  let currentEventName = ''

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()

    const eventHeader = line.match(/^EVENT\s+(\d+)\s+(.+)$/)
    if (eventHeader) {
      currentEventId = eventHeader[1]
      currentEventName = events[currentEventId] || eventHeader[2].trim()
      result[currentEventId] = []
      continue
    }

    if (!currentEventId) continue

    // Entry line: "1. Firstname SURNAME age Club 1:23.45"
    const timeMatch = line.match(/\s+([\d:]+\.\d+)\s*$/)
    if (!timeMatch) continue
    const seedTime = timeMatch[1]
    const rest = line.slice(0, line.lastIndexOf(timeMatch[0])).trim()

    // rest: "1. Firstname SURNAME age Club"
    const entryMatch = rest.match(/^\d+\.\s+(.+?)\s+(\d{1,3})\s+(.+)$/)
    if (!entryMatch) continue

    result[currentEventId].push({
      event_id: currentEventId,
      event_name: currentEventName,
      heat: '',
      lane: '',
      name: entryMatch[1].trim(),
      age: entryMatch[2],
      club: entryMatch[3].trim(),
      seed_time: seedTime,
      timestamp,
    })
  }

  return result
}

async function parseResultsPage(baseUrl: string, eventId: string, eventName: string, url: string): Promise<SwimResult[]> {
  const html = await fetchPage(baseUrl + url)
  if (!html) return []
  const $ = cheerio.load(html)
  const results: SwimResult[] = []
  const timestamp = new Date().toISOString()
  let currentAgeGroup = 'Unknown'
  $('h3, table').each((_, el) => {
    const tag = el.tagName.toLowerCase()
    if (tag === 'h3') {
      const text = $(el).text().trim()
      if (text.includes('Age Group')) currentAgeGroup = text.replace(' - Full Results', '').trim()
    } else if (tag === 'table') {
      const tbody = $(el).children('tbody')
      const directRows = tbody.length ? tbody.children('tr') : $(el).children('tr')
      directRows.each((_, row) => {
        const cells = $(row).children('td')
        if (cells.length < 6) return
        const place = $(cells[0]).text().trim().replace(/\.$/, '')
        const name = $(cells[1]).text().trim()
        if (!name || name === 'Name' || /^\d+m\b/i.test(name) || !/[a-zA-Z]/.test(name)) return
        const age = cells.length > 2 ? $(cells[2]).text().trim() : ''
        const club = cells.length > 3 ? $(cells[3]).text().trim() : ''
        const time = cells.length > 5 ? $(cells[5]).text().trim() : ''
        const wa_points = cells.length > 8 ? $(cells[8]).text().trim() : ''
        const split_50 = cells.length > 10 ? $(cells[10]).text().trim() : ''
        if (name && (place || time)) results.push({ event_id: eventId, event_name: eventName, age_group: currentAgeGroup, place, name, age, club, time, wa_points, split_50, timestamp })
      })
    }
  })
  return results
}

async function parseStartListPage(baseUrl: string, eventId: string, eventName: string, url: string): Promise<StartListEntry[]> {
  const html = await fetchPage(baseUrl + url)
  if (!html) return []
  const $ = cheerio.load(html)
  const entries: StartListEntry[] = []
  const timestamp = new Date().toISOString()
  let currentHeat = '1'
  $('table').each((_, table) => {
    const tbody = $(table).children('tbody')
    const directRows = tbody.length ? tbody.children('tr') : $(table).children('tr')
    directRows.each((_, row) => {
      const cells = $(row).children('td')
      if (cells.length === 1) { const m = $(cells[0]).text().trim().match(/Heat\s*(?:Number\s*-?\s*)?(\d+)/i); if (m) currentHeat = m[1]; return }
      if (cells.length < 6) return
      const lane = $(cells[0]).text().trim()
      if (lane === 'Lane' || !lane) return
      const name = $(cells[2]).text().trim()
      if (!name) return
      entries.push({ event_id: eventId, event_name: eventName, heat: currentHeat, lane, name, age: $(cells[3]).text().trim(), club: $(cells[4]).text().trim(), seed_time: $(cells[5]).text().trim(), timestamp })
    })
  })
  return entries
}

export async function pollAll(currentData: Partial<SwimData>, baseUrl: string): Promise<SwimData> {
  const { resultEvents, startEvents, events, sessions, title, draftPdfUrl } = await parseNavigation(baseUrl)
  const allResults: Record<string, SwimResult[]> = { ...(currentData.all_results || {}) }
  const startLists: Record<string, StartListEntry[]> = { ...(currentData.start_lists || {}) }

  for (const [eventId, eventName, url] of resultEvents) {
    const results = await parseResultsPage(baseUrl, eventId, eventName, url)
    if (results.length) allResults[eventId] = results
  }
  for (const [eventId, eventName, url] of startEvents) {
    const entries = await parseStartListPage(baseUrl, eventId, eventName, url)
    if (entries.length) startLists[eventId] = entries
  }

  // Fill in any events still missing start list data from the draft programme PDF
  if (draftPdfUrl) {
    const missingIds = Object.keys(events).filter(id => !startLists[id])
    if (missingIds.length > 0) {
      const draft = await parseDraftProgramme(baseUrl, draftPdfUrl, events)
      for (const eventId of missingIds) {
        if (draft[eventId]?.length) startLists[eventId] = draft[eventId]
      }
    }
  }

  return {
    last_updated: new Date().toISOString(),
    events, sessions, title,
    all_results: allResults,
    start_lists: startLists,
  }
}
