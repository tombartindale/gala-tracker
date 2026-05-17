<template>
  <div class="container">
    <header>
      <h1>Swim Results Tracker</h1>
      <p class="subtitle">{{ gala?.title || 'Loading...' }}</p>
    </header>

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

      <div class="status-bar">
        <div class="status-indicator">
          <span :class="['status-dot', isPending ? 'loading' : '']"></span>
          <span>{{ isPending ? 'Loading...' : 'Live' }}</span>
        </div>
        <span v-if="gala?.last_updated">
          Last updated: {{ new Date(gala.last_updated).toLocaleTimeString() }}
        </span>
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDocument, useCollection, firestoreDefaultConverter } from 'vuefire'
import { doc, collection } from 'firebase/firestore'
import { db } from './firebase'
import SwimmerCard from './components/SwimmerCard.vue'
import type { SwimmerData, HeatScheduleItem, SwimResult, StartListEntry } from './types'

const HEAT_DURATION: Record<string, number> = { '50m': 2.5, '100m': 4.0, 'default': 3.5 }
const EVENT_BUFFER = 2

// ── Firestore bindings ────────────────────────────────────────────────────────

const config = useDocument<{ current_gala_id: string }>(doc(db, 'config', 'scraper'))
const galaId = computed(() => config.value?.current_gala_id)

const gala = useDocument(computed(() =>
  galaId.value ? doc(db, 'galas', galaId.value) : null
))

const resultsCol = useCollection(computed(() =>
  galaId.value ? collection(db, 'galas', galaId.value, 'results') : null
))

const startListsCol = useCollection(computed(() =>
  galaId.value ? collection(db, 'galas', galaId.value, 'start_lists') : null
))

const isPending = computed(() => !gala.value && !!galaId.value)

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
  const swimmers = new Map<string, SwimmerData>()

  for (const results of Object.values(allResults.value)) {
    for (const r of results) {
      const key = r.name.toUpperCase()
      if (!swimmers.has(key)) swimmers.set(key, { displayName: r.name, club: r.club, age: r.age, results: [], startLists: [] })
      const s = swimmers.get(key)!
      s.results.push(r)
      if (r.club) s.club = r.club
      if (r.age) s.age = r.age
    }
  }

  for (const entries of Object.values(allStartLists.value)) {
    for (const e of entries) {
      const key = e.name.toUpperCase()
      if (!swimmers.has(key)) swimmers.set(key, { displayName: e.name, club: e.club, age: e.age, results: [], startLists: [] })
      const s = swimmers.get(key)!
      s.startLists.push(e)
      if (e.club) s.club = e.club
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
  const eventOrder = Object.keys(gala.value.events).sort((a, b) => parseInt(a) - parseInt(b))
  const schedule: HeatScheduleItem[] = []
  let cumulativeTime = 0

  for (const eventId of eventOrder) {
    const eventName = gala.value.events[eventId]
    const startList = allStartLists.value[eventId] || []
    const isComplete = (allResults.value[eventId] || []).length > 0
    const heats = [...new Set(startList.map(e => e.heat))].sort((a, b) => parseInt(a) - parseInt(b))
    const heatDuration = eventName.includes('50m') ? HEAT_DURATION['50m'] : eventName.includes('100m') ? HEAT_DURATION['100m'] : HEAT_DURATION['default']

    for (const heat of heats) {
      schedule.push({ eventId, heat, eventName, isComplete, estimatedTime: cumulativeTime, heatDuration })
      cumulativeTime += heatDuration
    }
    if (heats.length) cumulativeTime += EVENT_BUFFER
  }
  return schedule
})

// ── Search / filter ───────────────────────────────────────────────────────────

const searchQuery = ref('')
const clubFilter = ref('')
const activeNameFilter = ref('')
const activeClubFilter = ref('')
const suggestions = ref<{ name: string; displayName: string; club: string }[]>([])

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

const clubTotalRaces = computed(() => searchMatches.value.reduce((s, m) => s + m.data.results.filter(r => !r.time?.includes('DNA')).length, 0))
const clubTotalGolds = computed(() => searchMatches.value.reduce((s, m) => s + m.data.results.filter(r => r.place === '1').length, 0))
const clubTotalMedals = computed(() => searchMatches.value.reduce((s, m) => s + m.data.results.filter(r => ['1','2','3'].includes(r.place)).length, 0))

function doSearch() {
  suggestions.value = []
  activeNameFilter.value = searchQuery.value.trim().toUpperCase()
  activeClubFilter.value = clubFilter.value
}

function onSearchInput() {
  const q = searchQuery.value.trim()
  if (!q || q.length < 2) { suggestions.value = []; return }
  const upper = q.toUpperCase()
  const club = clubFilter.value
  const matches: typeof suggestions.value = []
  for (const [name, data] of allSwimmers.value) {
    if (name.includes(upper) && (!club || data.club === club)) matches.push({ name, displayName: data.displayName, club: data.club })
    if (matches.length >= 10) break
  }
  suggestions.value = matches
}

function selectSuggestion(name: string) {
  searchQuery.value = name
  suggestions.value = []
  doSearch()
}

function selectSwimmer(name: string) {
  searchQuery.value = name
  doSearch()
}

function filterByClub(club: string) {
  clubFilter.value = club
  searchQuery.value = ''
  doSearch()
}

function clearNameFilter() { searchQuery.value = ''; activeNameFilter.value = '' }
function clearClubFilter() { clubFilter.value = ''; activeClubFilter.value = '' }
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); min-height: 100vh; color: #e4e4e4; padding: 20px; }
.container { max-width: 1100px; margin: 0 auto; }
header { text-align: center; margin-bottom: 30px; }
h1 { font-size: 2.5rem; color: #00d9ff; margin-bottom: 10px; }
.subtitle { color: #888; font-size: 1rem; }
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
@media (max-width: 768px) { h1 { font-size: 1.8rem; } .search-row, .search-input-wrapper { flex-direction: column; } select { width: 100%; } }
</style>
