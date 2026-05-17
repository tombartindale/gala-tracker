<template>
  <div class="container">
    <header>
      <p class="app-label">Swim Results Tracker</p>
      <h1>{{ gala?.title || 'Loading...' }}</h1>
      <nav v-if="allGalas.length > 1" class="gala-nav">
        <router-link
          v-for="g in allGalas"
          :key="g.gala_id"
          :to="g.isToday ? '/' : { name: 'gala', params: { galaId: g.gala_id } }"
          :class="['gala-nav-item', { active: galaId === g.gala_id }]"
        >{{ g.label }}</router-link>
      </nav>
    </header>

    <div v-if="isHistorical" class="historical-banner">
      Viewing past results &mdash; <router-link to="/">Back to today</router-link>
    </div>

    <div v-if="showBanner" class="info-banner">
      <div class="info-banner-content">
        <div class="info-banner-text">
          <strong>Results are sourced directly from the official timing pages for this gala.</strong>
          Search for a swimmer's name or select a club from the dropdown to get started.
        </div>
        <button class="info-banner-close" @click="showBanner = false" aria-label="Dismiss">✕</button>
      </div>
    </div>

    <div class="search-box">
      <div class="search-row">
        <div class="search-input-wrapper">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Enter swimmer name (e.g., BOUGH, Smith)..."
            autocomplete="off"
            @input="onSearchInput"
            @keypress.enter="doSearch"
          />
          <select v-model="clubFilter" @change="doSearch">
            <option value="">All Clubs</option>
            <option v-for="club in sortedClubs" :key="club" :value="club">{{ club }}</option>
          </select>
        </div>
        <button class="btn btn-primary" @click="doSearch">Search</button>
      </div>

      <div class="filter-tags">
        <span v-if="activeNameFilter" class="filter-tag">
          Name: {{ activeNameFilter }}
          <span class="remove" @click="clearNameFilter">✕</span>
        </span>
        <span v-if="activeClubFilter" class="filter-tag">
          Club: {{ activeClubFilter }}
          <span class="remove" @click="clearClubFilter">✕</span>
        </span>
      </div>

      <div v-if="suggestions.length" class="suggestions">
        <div
          v-for="s in suggestions"
          :key="s.name"
          class="suggestion-item"
          @click="selectSuggestion(s.displayName)"
        >
          {{ s.displayName }} <span style="color:#666">- {{ s.club || 'Unknown' }}</span>
        </div>
      </div>

      <div v-if="gala?.last_updated" class="status-bar">
        <span>Last updated: {{ new Date(gala.last_updated).toLocaleTimeString() }}</span>
      </div>
    </div>

    <div v-if="upcomingHeats.length" class="heat-strip">
      <div v-for="(h, i) in upcomingHeats" :key="`${h.eventId}-${h.heat}`" :class="['heat-strip-item', i === 0 ? 'heat-current' : '']">
        <div class="heat-strip-label">{{ i === 0 ? 'NOW' : h.estimatedStart ? `~${formatHeatTime(h.estimatedStart)}` : `+${i}` }}</div>
        <div class="heat-strip-event">{{ h.eventName }}</div>
        <div class="heat-strip-heat">Heat {{ h.heat }}</div>
      </div>
    </div>

    <div v-if="!activeNameFilter && !activeClubFilter" class="no-results">
      <div class="no-results-icon">🏊</div>
      <p>Enter a swimmer's name or select a club to view results</p>
    </div>

    <div v-else-if="searchMatches.length === 0" class="no-results">
      <div class="no-results-icon">🔍</div>
      <p>No swimmers found matching your search</p>
    </div>

    <template v-else>
      <div v-if="activeClubFilter && searchMatches.length > 1" class="club-summary">
        <h3>🏊 {{ activeClubFilter }} — {{ searchMatches.length }} Swimmers</h3>
        <div class="swimmer-stats" style="margin-bottom:15px;">
          <div class="stat-box"><div class="stat-value">{{ clubTotalRaces }}</div><div class="stat-label">Races</div></div>
          <div class="stat-box"><div class="stat-value">{{ clubTotalGolds }}</div><div class="stat-label">1st</div></div>
          <div class="stat-box"><div class="stat-value">{{ clubTotalMedals }}</div><div class="stat-label">Medals</div></div>
        </div>
        <div class="club-swimmers-grid">
          <div v-for="s in searchMatches" :key="s.name" class="club-swimmer-item" @click="selectSwimmer(s.data.displayName)">
            <div class="club-swimmer-name">{{ s.data.displayName }}</div>
            <div class="club-swimmer-stats">{{ s.data.results.length }} races • {{ s.data.results.filter(r => r.place === '1').length }} wins</div>
          </div>
        </div>

        <div v-if="clubUpcomingRaces.length" class="club-upcoming">
          <h4>Upcoming Races</h4>
          <div v-for="race in clubUpcomingRaces" :key="`${race.eventId}-${race.heat}`" class="club-upcoming-row">
            <div class="club-upcoming-time">
              <span v-if="race.estimatedStart" class="est-time">~{{ formatHeatTime(race.estimatedStart) }}</span>
              <span v-else class="est-time no-time">—</span>
            </div>
            <div class="club-upcoming-event">{{ race.eventName }} · Heat {{ race.heat }}</div>
            <div class="club-upcoming-swimmers">
              <span v-for="s in race.swimmers.sort((a,b) => parseInt(a.lane)-parseInt(b.lane))" :key="s.displayName" class="club-upcoming-swimmer">
                {{ s.displayName }}<span class="swimmer-lane">Ln {{ s.lane }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <SwimmerCard
        v-for="{ name, data } in displayMatches"
        :key="name"
        :data="data"
        :heat-schedule="heatSchedule"
        :age-group-counts="ageGroupCounts"
        @filter-club="filterByClub"
      />

      <p v-if="activeClubFilter && searchMatches.length > 10" style="text-align:center;color:#888;">
        Showing 10 of {{ searchMatches.length }} swimmers. Search by name to see specific swimmers.
      </p>
    </template>

    <footer class="app-footer">
      Open source &mdash; <a href="https://github.com/tombartindale/gala-tracker" target="_blank" rel="noopener">github.com/tombartindale/gala-tracker</a>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { useDocument, useCollection } from 'vuefire'
import { doc, collection } from 'firebase/firestore'
import { db } from './firebase'
import { useRoute, useRouter } from 'vue-router'
import SwimmerCard from './components/SwimmerCard.vue'
import type { SwimmerData, HeatScheduleItem, SwimResult, StartListEntry } from './types'

const route = useRoute()
const router = useRouter()

const now = ref(new Date())
const _tick = setInterval(() => { now.value = new Date() }, 30_000)
onUnmounted(() => clearInterval(_tick))

function isRelayCode(name: string) { return /^[A-Z0-9]+_[A-Z0-9]+_[MFX]$/.test(name) }
function parseRelayCode(name: string) {
  const parts = name.split('_')
  const gender = parts.at(-1) === 'F' ? 'Female' : 'Male'
  const team = parts.at(-2) ?? '?'
  return `Team ${team} (${gender})`
}

const HEAT_DURATION: Record<string, number> = { '50m': 3.5, '100m': 5.5, 'default': 4.5 }
const HEAT_OVERHEAD = 0.75 // minutes added per heat beyond the slowest swim time (blocks, start, recovery)
const EVENT_BUFFER = 2

// ── Firestore bindings ────────────────────────────────────────────────────────

interface GalaConfig { gala_id: string; race_dates: string[] }
const config = useDocument<{ galas: GalaConfig[] }>(doc(db, 'config', 'scraper'))

function todayUK() { return new Date().toLocaleDateString('en-GB') }

function formatGalaDates(dates: string[]): string {
  if (!dates.length) return ''
  const parse = (d: string) => { const [day, mon, yr] = d.split('/'); return new Date(+yr, +mon - 1, +day) }
  const sorted = [...dates].sort()
  const first = parse(sorted[0]), last = parse(sorted[sorted.length - 1])
  const mon = first.toLocaleDateString('en-GB', { month: 'short' })
  const yr = first.getFullYear()
  return sorted.length === 1
    ? `${first.getDate()} ${mon} ${yr}`
    : `${first.getDate()}–${last.getDate()} ${mon} ${yr}`
}

const todayGalaId = computed(() => {
  const today = todayUK()
  return config.value?.galas?.find(g => g.race_dates.includes(today))?.gala_id ?? null
})

const galaId = computed(() =>
  (route.params.galaId as string | undefined) ?? todayGalaId.value ?? undefined
)

const isHistorical = computed(() =>
  !!route.params.galaId && route.params.galaId !== todayGalaId.value
)

const allGalas = computed(() =>
  (config.value?.galas ?? []).map(g => ({
    gala_id: g.gala_id,
    isToday: g.race_dates.includes(todayUK()),
    label: formatGalaDates(g.race_dates),
  }))
)

const gala = useDocument(computed(() =>
  galaId.value ? doc(db, 'galas', galaId.value) : null
))

const resultsCol = useCollection(computed(() =>
  galaId.value ? collection(db, 'galas', galaId.value, 'results') : null
))

const startListsCol = useCollection(computed(() =>
  galaId.value ? collection(db, 'galas', galaId.value, 'start_lists') : null
))


// ── Derived data ──────────────────────────────────────────────────────────────

const allResults = computed<Record<string, SwimResult[]>>(() => {
  const map: Record<string, SwimResult[]> = {}
  for (const doc of resultsCol.value) map[doc.id] = (doc as any).data
  return map
})

const allStartLists = computed<Record<string, StartListEntry[]>>(() => {
  const map: Record<string, StartListEntry[]> = {}
  for (const doc of startListsCol.value) map[doc.id] = (doc as any).data
  return map
})

const ageGroupCounts = computed(() => {
  const counts: Record<string, Record<string, number>> = {}
  for (const [eventId, results] of Object.entries(allResults.value)) {
    counts[eventId] = {}
    for (const r of results) {
      if (r.age_group && r.place && !r.time.includes('DQ') && !r.time.includes('DNA')) {
        counts[eventId][r.age_group] = (counts[eventId][r.age_group] || 0) + 1
      }
    }
  }
  return counts
})

const allSwimmers = computed<Map<string, SwimmerData>>(() => {
  // Collect every club name that appears anywhere in the data
  const allClubNames = new Set<string>()
  for (const results of Object.values(allResults.value))
    for (const r of results) if (r.club) allClubNames.add(r.club)
  for (const entries of Object.values(allStartLists.value))
    for (const e of entries) if (e.club) allClubNames.add(e.club)

  // Build a normalization map: short/abbreviated name → longest matching name.
  // "Darlington" → "Darlington SC", "Northall'ton" → "Northallerton SC", etc.
  const clubNorm = new Map<string, string>()
  for (const club of allClubNames) {
    const lc = club.toLowerCase()
    const prefix = lc.includes("'") ? lc.split("'")[0] : lc
    let best = club
    for (const other of allClubNames) {
      if (other !== club && other.toLowerCase().startsWith(prefix) && other.length > best.length)
        best = other
    }
    clubNorm.set(club, best)
  }

  const normalizeClub = (club: string) => clubNorm.get(club) ?? club

  const swimmers = new Map<string, SwimmerData>()

  for (const results of Object.values(allResults.value)) {
    for (const r of results) {
      if (/^\d+m\b/i.test(r.name)) continue
      const key = r.name.toUpperCase()
      const relay = isRelayCode(r.name)
      const club = normalizeClub(r.club)
      if (!swimmers.has(key)) swimmers.set(key, { displayName: relay ? parseRelayCode(r.name) : r.name, club, age: r.age, results: [], startLists: [], isRelay: relay })
      const s = swimmers.get(key)!
      s.results.push(r)
      if (club) s.club = club
      if (r.age) s.age = r.age
    }
  }

  for (const entries of Object.values(allStartLists.value)) {
    for (const e of entries) {
      const key = e.name.toUpperCase()
      const relay = isRelayCode(e.name)
      const club = normalizeClub(e.club)
      if (!swimmers.has(key)) swimmers.set(key, { displayName: relay ? parseRelayCode(e.name) : e.name, club, age: e.age, results: [], startLists: [], isRelay: relay })
      const s = swimmers.get(key)!
      s.startLists.push(e)
      if (club) s.club = club
      if (e.age) s.age = e.age
    }
  }

  return swimmers
})

const sortedClubs = computed(() => {
  const clubs = new Set<string>()
  for (const s of allSwimmers.value.values()) if (s.club) clubs.add(s.club)
  return [...clubs].sort()
})

const heatSchedule = computed<HeatScheduleItem[]>(() => {
  if (!gala.value?.events) return []

  const sessions: { session_number: number; date: string; start_time: string; events: string[] }[] = gala.value.sessions || []
  const eventOrder = Object.keys(gala.value.events).sort((a, b) => parseInt(a) - parseInt(b))

  function parseSessionStart(date: string, time: string): Date | null {
    const dp = date.match(/^(\d+)\/(\d+)\/(\d+)$/)
    const tp = time.match(/^(\d+):(\d+)$/)
    if (!dp || !tp) return null
    return new Date(parseInt(dp[3]), parseInt(dp[2]) - 1, parseInt(dp[1]), parseInt(tp[1]), parseInt(tp[2]))
  }

  // Build groups: one per session (in session order), plus orphan events
  type Group = { sessionStart: Date | null; eventIds: string[] }
  const groups: Group[] = []

  if (sessions.length) {
    const allSessionEventIds = new Set(sessions.flatMap(s => s.events))
    for (const s of [...sessions].sort((a, b) => a.session_number - b.session_number)) {
      const ids = eventOrder.filter(id => s.events.includes(id))
      groups.push({ sessionStart: parseSessionStart(s.date, s.start_time), eventIds: ids })
    }
    const orphans = eventOrder.filter(id => !allSessionEventIds.has(id))
    if (orphans.length) groups.push({ sessionStart: null, eventIds: orphans })
  } else {
    groups.push({ sessionStart: null, eventIds: eventOrder })
  }

  function parseTime(s: string): number | null {
    if (!s || /^(NT|NTT|NS|DQ|DN|DSQ)/i.test(s.trim())) return null
    const m = s.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/)
    if (!m) return null
    return (m[1] ? parseInt(m[1]) : 0) + parseFloat(m[2]) / 60
  }

  function calcHeatDuration(eventId: string, heat: string, startList: typeof allStartLists.value[string], isComplete: boolean, fallback: number): number {
    const heatEntries = startList.filter(e => e.heat === heat)
    if (isComplete) {
      // For completed events, join result times to start list entries by name for accuracy
      const results = allResults.value[eventId] || []
      const nameToTime = new Map(results.map(r => [r.name.toUpperCase(), parseTime(r.time)]))
      const actuals = heatEntries.map(e => nameToTime.get(e.name.toUpperCase())).filter((t): t is number => typeof t === 'number')
      if (actuals.length) return Math.max(...actuals) + HEAT_OVERHEAD
    }
    const seeds = heatEntries.map(e => parseTime(e.seed_time)).filter((t): t is number => t !== null)
    return seeds.length ? Math.max(...seeds) + HEAT_OVERHEAD : fallback
  }

  const schedule: HeatScheduleItem[] = []

  for (const { sessionStart, eventIds } of groups) {
    let cumulativeMins = 0
    for (const eventId of eventIds) {
      const eventName = gala.value.events[eventId]
      const startList = allStartLists.value[eventId] || []
      const isComplete = (allResults.value[eventId] || []).length > 0
      const heats = [...new Set(startList.map(e => e.heat))].sort((a, b) => parseInt(a) - parseInt(b))
      const fallbackDuration = eventName.includes('50m') ? HEAT_DURATION['50m'] : eventName.includes('100m') ? HEAT_DURATION['100m'] : HEAT_DURATION['default']

      for (const heat of heats) {
        const heatDuration = calcHeatDuration(eventId, heat, startList, isComplete, fallbackDuration)
        const estimatedStart = sessionStart
          ? new Date(sessionStart.getTime() + cumulativeMins * 60 * 1000)
          : null
        schedule.push({ eventId, heat, eventName, isComplete, estimatedTime: cumulativeMins, heatDuration, estimatedStart })
        cumulativeMins += heatDuration
      }
      if (heats.length) cumulativeMins += EVENT_BUFFER
    }
  }

  // Determine which heat within the current event is running now.
  // Strategy: use the scrape timestamp of the last completed event's results as a real-clock
  // anchor for when the current event started — far more reliable than accumulating durations
  // from session start, which compounds errors across every preceding event.
  const nowMs = now.value.getTime()
  const firstEventIncomplete = schedule.findIndex(h => !h.isComplete)
  if (firstEventIncomplete !== -1) {
    const lastCompleteEventId = firstEventIncomplete > 0 ? schedule[firstEventIncomplete - 1].eventId : null
    const lastResults = lastCompleteEventId ? (allResults.value[lastCompleteEventId] || []) : []
    const lastScrapedMs = lastResults.length
      ? Math.max(...lastResults.map(r => new Date(r.timestamp).getTime()).filter(t => !isNaN(t)))
      : NaN

    if (!isNaN(lastScrapedMs)) {
      // Current event started some time after the scraper last saw the previous event's results.
      // Use scrape time + a small buffer as our best estimate of event start.
      const currentEventStartMs = lastScrapedMs + EVENT_BUFFER * 60_000
      const timeIntoEventMs = Math.max(0, nowMs - currentEventStartMs)
      const currentEventId = schedule[firstEventIncomplete].eventId
      let cumulativeMs = 0
      for (let i = firstEventIncomplete; i < schedule.length && schedule[i].eventId === currentEventId; i++) {
        const heatMs = schedule[i].heatDuration * 60_000
        if (cumulativeMs + heatMs <= timeIntoEventMs) {
          schedule[i].isComplete = true
          cumulativeMs += heatMs
        } else {
          break
        }
      }
    }
  }

  // Anchor the current heat (first still-incomplete) to now so past drift doesn't compound
  const firstIncomplete = schedule.findIndex(h => !h.isComplete)
  if (firstIncomplete !== -1) {
    const baseOffset = schedule[firstIncomplete].estimatedTime
    for (let i = firstIncomplete; i < schedule.length; i++) {
      const relativeMs = (schedule[i].estimatedTime - baseOffset) * 60_000
      schedule[i].estimatedStart = new Date(nowMs + relativeMs)
    }
  }

  return schedule
})

// ── Search / filter ───────────────────────────────────────────────────────────

const showBanner = ref(true)
const searchQuery = ref('')
const clubFilter = ref('')
const suggestions = ref<{ name: string; displayName: string; club: string }[]>([])

const activeNameFilter = computed(() =>
  (route.name === 'swimmer' || route.name === 'gala-swimmer') ? (route.params.name as string).toUpperCase() : ''
)
const activeClubFilter = computed(() => {
  if (route.name === 'club' || route.name === 'gala-club') return decodeURIComponent(route.params.club as string)
  if ((route.name === 'swimmer' || route.name === 'gala-swimmer') && route.query.club) return route.query.club as string
  return ''
})

// Keep search box inputs in sync with the URL on navigation / page load
watch(route, () => {
  if (route.name === 'swimmer' || route.name === 'gala-swimmer') {
    searchQuery.value = decodeURIComponent(route.params.name as string)
    clubFilter.value = (route.query.club as string) || ''
  } else if (route.name === 'club' || route.name === 'gala-club') {
    searchQuery.value = ''
    clubFilter.value = decodeURIComponent(route.params.club as string)
  } else {
    searchQuery.value = ''
    clubFilter.value = ''
  }
}, { immediate: true })

const searchMatches = computed(() => {
  const q = activeNameFilter.value
  const club = activeClubFilter.value
  const matches: { name: string; data: SwimmerData }[] = []
  for (const [name, data] of allSwimmers.value) {
    if ((!q || name.includes(q)) && (!club || data.club === club)) matches.push({ name, data })
  }
  return matches.sort((a, b) => b.data.results.length - a.data.results.length)
})

const displayMatches = computed(() =>
  activeClubFilter.value ? searchMatches.value.slice(0, 10) : searchMatches.value
)

const upcomingHeats = computed(() => {
  const firstIncomplete = heatSchedule.value.findIndex(h => !h.isComplete)
  if (firstIncomplete === -1) return []
  return heatSchedule.value.slice(firstIncomplete, firstIncomplete + 6)
})

const clubTotalRaces = computed(() => searchMatches.value.reduce((s, m) => s + m.data.results.filter(r => !r.time?.includes('DNA')).length, 0))
const clubTotalGolds = computed(() => searchMatches.value.reduce((s, m) => s + m.data.results.filter(r => r.place === '1').length, 0))
const clubTotalMedals = computed(() => searchMatches.value.reduce((s, m) => s + m.data.results.filter(r => ['1','2','3'].includes(r.place)).length, 0))

const clubUpcomingRaces = computed(() => {
  if (!activeClubFilter.value) return []
  const completedEvents = new Set(Object.keys(allResults.value).filter(id => (allResults.value[id] || []).length > 0))
  type HeatEntry = { eventId: string; heat: string; eventName: string; scheduleIndex: number; estimatedStart: Date | null; swimmers: { displayName: string; lane: string; seedTime: string }[] }
  const heatMap = new Map<string, HeatEntry>()
  for (const { data } of searchMatches.value) {
    for (const entry of data.startLists) {
      if (completedEvents.has(entry.event_id)) continue
      const key = `${entry.event_id}-${entry.heat}`
      if (!heatMap.has(key)) {
        const idx = heatSchedule.value.findIndex(h => h.eventId === entry.event_id && h.heat === entry.heat)
        const item = idx !== -1 ? heatSchedule.value[idx] : null
        heatMap.set(key, { eventId: entry.event_id, heat: entry.heat, eventName: entry.event_name, scheduleIndex: idx, estimatedStart: item?.estimatedStart ?? null, swimmers: [] })
      }
      heatMap.get(key)!.swimmers.push({ displayName: data.displayName, lane: entry.lane, seedTime: entry.seed_time })
    }
  }
  return [...heatMap.values()].sort((a, b) => a.scheduleIndex - b.scheduleIndex)
})

function navigate(name: string, club: string) {
  suggestions.value = []
  const n = name.trim()
  const c = club.trim()
  const g = route.params.galaId as string | undefined
  if (g) {
    if (n && c) router.push({ name: 'gala-swimmer', params: { galaId: g, name: n }, query: { club: c } })
    else if (n) router.push({ name: 'gala-swimmer', params: { galaId: g, name: n } })
    else if (c) router.push({ name: 'gala-club', params: { galaId: g, club: c } })
    else router.push({ name: 'gala', params: { galaId: g } })
  } else {
    if (n && c) router.push({ name: 'swimmer', params: { name: n }, query: { club: c } })
    else if (n) router.push({ name: 'swimmer', params: { name: n } })
    else if (c) router.push({ name: 'club', params: { club: c } })
    else router.push('/')
  }
}

function doSearch() { navigate(searchQuery.value, clubFilter.value) }

function onSearchInput() {
  const q = searchQuery.value.trim()
  if (!q || q.length < 2) { suggestions.value = []; return }
  const upper = q.toUpperCase()
  const club = clubFilter.value
  const matches: typeof suggestions.value = []
  for (const [name, data] of allSwimmers.value) {
    if (!data.isRelay && name.includes(upper) && (!club || data.club === club)) matches.push({ name, displayName: data.displayName, club: data.club })
    if (matches.length >= 10) break
  }
  suggestions.value = matches
}

function selectSuggestion(name: string) {
  suggestions.value = []
  navigate(name, clubFilter.value)
}

function selectSwimmer(name: string) {
  const g = route.params.galaId as string | undefined
  g ? router.push({ name: 'gala-swimmer', params: { galaId: g, name } }) : router.push({ name: 'swimmer', params: { name } })
}
function filterByClub(club: string) {
  const g = route.params.galaId as string | undefined
  g ? router.push({ name: 'gala-club', params: { galaId: g, club } }) : router.push({ name: 'club', params: { club } })
}
function clearNameFilter() {
  const g = route.params.galaId as string | undefined
  if (activeClubFilter.value) {
    g ? router.push({ name: 'gala-club', params: { galaId: g, club: activeClubFilter.value } }) : router.push({ name: 'club', params: { club: activeClubFilter.value } })
  } else {
    g ? router.push({ name: 'gala', params: { galaId: g } }) : router.push('/')
  }
}
function clearClubFilter() {
  const g = route.params.galaId as string | undefined
  if (activeNameFilter.value) {
    g ? router.push({ name: 'gala-swimmer', params: { galaId: g, name: activeNameFilter.value } }) : router.push({ name: 'swimmer', params: { name: activeNameFilter.value } })
  } else {
    g ? router.push({ name: 'gala', params: { galaId: g } }) : router.push('/')
  }
}
function formatHeatTime(d: Date) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) }
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); min-height: 100vh; color: #e4e4e4; padding: 20px; }
.container { max-width: 1100px; margin: 0 auto; }
header { text-align: center; margin-bottom: 30px; }
.app-label { color: #888; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
h1 { font-size: 2.5rem; color: #00d9ff; margin-bottom: 10px; }
.search-box { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
.search-row { display: flex; gap: 10px; margin-bottom: 15px; }
.search-input-wrapper { flex: 1; display: flex; gap: 10px; }
input[type=text] { flex: 1; padding: 15px 20px; font-size: 1.1rem; border: 2px solid rgba(0,217,255,0.3); border-radius: 8px; background: rgba(0,0,0,0.3); color: #fff; outline: none; transition: border-color 0.3s; }
input[type=text]:focus { border-color: #00d9ff; }
input[type=text]::placeholder { color: #666; }
select { padding: 15px 20px; font-size: 1rem; border: 2px solid rgba(0,217,255,0.3); border-radius: 8px; background: rgba(0,0,0,0.3); color: #fff; outline: none; min-width: 180px; cursor: pointer; }
select option { background: #1a1a2e; }
.btn { padding: 15px 30px; font-size: 1rem; font-weight: 600; border: none; border-radius: 8px; cursor: pointer; transition: all 0.3s; }
.btn-primary { background: #00d9ff; color: #1a1a2e; }
.btn-primary:hover { background: #00b8d9; transform: translateY(-2px); }
.filter-tags { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; min-height: 24px; }
.filter-tag { background: rgba(0,217,255,0.2); color: #00d9ff; padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; display: flex; align-items: center; gap: 6px; }
.filter-tag .remove { cursor: pointer; opacity: 0.7; }
.filter-tag .remove:hover { opacity: 1; }
.status-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.85rem; color: #666; }
.status-indicator { display: flex; align-items: center; gap: 8px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: #4caf50; animation: pulse 2s infinite; }
.status-dot.loading { background: #ffc107; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.suggestions { background: rgba(0,0,0,0.3); border-radius: 8px; margin-top: 10px; max-height: 200px; overflow-y: auto; }
.suggestion-item { padding: 12px 20px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s; }
.suggestion-item:hover { background: rgba(0,217,255,0.1); }
.no-results { text-align: center; padding: 60px 20px; color: #666; }
.no-results-icon { font-size: 4rem; margin-bottom: 20px; }
.club-summary { background: rgba(255,193,7,0.1); border: 1px solid rgba(255,193,7,0.3); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
.club-summary h3 { color: #ffc107; margin-bottom: 15px; }
.club-swimmers-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.club-swimmer-item { background: rgba(0,0,0,0.2); padding: 10px 15px; border-radius: 6px; cursor: pointer; transition: background 0.2s; }
.club-swimmer-item:hover { background: rgba(0,217,255,0.1); }
.club-swimmer-name { font-weight: 500; color: #fff; }
.club-swimmer-stats { font-size: 0.8rem; color: #888; }
.swimmer-stats { display: flex; gap: 15px; text-align: center; flex-wrap: wrap; }
.stat-box { background: rgba(0,217,255,0.1); padding: 12px 16px; border-radius: 8px; min-width: 70px; }
.stat-value { font-size: 1.4rem; font-weight: 700; color: #00d9ff; }
.stat-label { font-size: 0.7rem; color: #888; text-transform: uppercase; }
.heat-strip { display: flex; gap: 8px; margin-bottom: 14px; overflow-x: auto; padding-bottom: 4px; }
.heat-strip-item { flex: 0 0 auto; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px 14px; min-width: 130px; }
.heat-strip-item.heat-current { background: rgba(0,217,255,0.12); border-color: rgba(0,217,255,0.4); }
.heat-strip-label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 4px; }
.heat-strip-item.heat-current .heat-strip-label { color: #00d9ff; }
.heat-strip-event { font-size: 0.82rem; color: #ddd; font-weight: 500; line-height: 1.3; margin-bottom: 2px; }
.heat-strip-heat { font-size: 0.75rem; color: #666; }
.heat-strip-item.heat-current .heat-strip-heat { color: #aaa; }
.club-upcoming { margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 16px; }
.club-upcoming h4 { color: #ffc107; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; }
.club-upcoming-row { display: flex; align-items: baseline; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); flex-wrap: wrap; }
.club-upcoming-row:last-child { border-bottom: none; }
.club-upcoming-time { flex: 0 0 60px; }
.est-time { font-size: 0.8rem; font-weight: 600; color: #aaa; font-variant-numeric: tabular-nums; }
.est-time::before { content: ''; }
.no-time { color: #555; }
.club-upcoming-event { flex: 0 0 auto; font-size: 0.85rem; color: #ddd; white-space: nowrap; }
.club-upcoming-swimmers { display: flex; gap: 10px; flex-wrap: wrap; flex: 1; }
.club-upcoming-swimmer { font-size: 0.82rem; color: #fff; background: rgba(0,217,255,0.1); padding: 2px 8px; border-radius: 12px; display: flex; align-items: center; gap: 5px; }
.swimmer-lane { font-size: 0.7rem; color: #888; }
.gala-nav { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 14px; }
.gala-nav-item { padding: 5px 14px; border-radius: 20px; font-size: 0.82rem; color: #888; border: 1px solid rgba(255,255,255,0.1); text-decoration: none; transition: all 0.2s; }
.gala-nav-item:hover { color: #ddd; border-color: rgba(255,255,255,0.25); }
.gala-nav-item.active { color: #00d9ff; border-color: rgba(0,217,255,0.5); background: rgba(0,217,255,0.08); }
.historical-banner { background: rgba(255,193,7,0.08); border: 1px solid rgba(255,193,7,0.25); border-radius: 8px; padding: 10px 16px; margin-bottom: 18px; font-size: 0.88rem; color: #b8960a; text-align: center; }
.historical-banner a { color: #ffc107; text-decoration: none; font-weight: 600; }
.historical-banner a:hover { text-decoration: underline; }
.info-banner { background: rgba(0,217,255,0.08); border: 1px solid rgba(0,217,255,0.25); border-radius: 10px; padding: 14px 18px; margin-bottom: 18px; }
.info-banner-content { display: flex; align-items: center; gap: 12px; }
.info-banner-text { flex: 1; font-size: 0.9rem; color: #b0e8f0; line-height: 1.5; }
.info-banner-text strong { color: #00d9ff; display: block; margin-bottom: 2px; }
.info-banner-close { background: none; border: none; color: #666; font-size: 1rem; cursor: pointer; padding: 4px 8px; border-radius: 4px; flex-shrink: 0; transition: color 0.2s; }
.info-banner-close:hover { color: #aaa; }
@media (max-width: 768px) {
  body { padding: 10px; }
  h1 { font-size: 1.8rem; }
  .search-row, .search-input-wrapper { flex-direction: column; }
  select { width: 100%; min-width: unset; }
  .club-upcoming-event { white-space: normal; }
  .club-upcoming-row { gap: 8px; }
  .club-swimmers-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
  .swimmer-stats { gap: 8px; }
  .stat-box { padding: 10px 12px; min-width: 60px; }
  .stat-value { font-size: 1.2rem; }
}
.app-footer { text-align: center; margin-top: 40px; padding: 20px; font-size: 0.8rem; color: #444; }
.app-footer a { color: #666; text-decoration: none; }
.app-footer a:hover { color: #888; }
</style>
