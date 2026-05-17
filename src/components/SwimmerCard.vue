<template>
  <div class="swimmer-card">
    <div class="swimmer-header">
      <div>
        <h2 class="swimmer-name">
          {{ data.displayName }}
          <span v-if="data.isRelay" class="relay-badge">Relay</span>
        </h2>
        <p class="swimmer-club">
          <span v-if="data.club" class="club-badge" @click="$emit('filterClub', data.club)">{{ data.club }}</span>
          <span v-else>Unknown Club</span>
          <span v-if="!data.isRelay && data.age"> • Age {{ data.age }}</span>
        </p>
      </div>
      <div class="swimmer-stats">
        <div class="stat-box"><div class="stat-value">{{ completedRaces }}</div><div class="stat-label">Races</div></div>
        <div class="stat-box" style="background:rgba(255,215,0,0.15)"><div class="stat-value" style="color:#ffd700">{{ goldCount }}</div><div class="stat-label">1st</div></div>
        <div class="stat-box" style="background:rgba(192,192,192,0.15)"><div class="stat-value" style="color:#c0c0c0">{{ silverCount }}</div><div class="stat-label">2nd</div></div>
        <div class="stat-box" style="background:rgba(205,127,50,0.15)"><div class="stat-value" style="color:#cd7f32">{{ bronzeCount }}</div><div class="stat-label">3rd</div></div>
      </div>
    </div>

    <div v-if="upcomingRaces.length" class="timeline-section">
      <div class="timeline-header">
        <div class="timeline-title">⏱️ Race Timeline</div>
        <div class="current-event-badge">
          Now: {{ currentHeat ? currentHeat.eventName.replace(/^\d+\s*/, '') : '?' }}
          Heat {{ currentHeat?.heat || '?' }}
        </div>
      </div>
      <div class="timeline-track">
        <div class="timeline-progress" :style="{ width: progressPercent + '%' }"></div>
      </div>
      <div class="eta-display">
        <div class="eta-label">Next Race</div>
        <div class="eta-race-code">{{ upcomingRaces[0].event_id }} – {{ upcomingRaces[0].heat }}</div>
        <div class="eta-detail">
          {{ heatsUntilNext }} heat{{ heatsUntilNext !== 1 ? 's' : '' }} away
          <span class="eta-time-inline">· ~{{ formatETA(nextRaceETA) }}</span>
        </div>
      </div>
    </div>

    <div :class="['race-columns', { 'race-columns--split': upcomingRaces.length && data.results.length }]">
      <div v-if="upcomingRaces.length" class="race-panel">
        <div class="section-title">Upcoming Races</div>
        <div class="upcoming-race-list">
          <div v-for="race in upcomingRaces" :key="race.event_id + race.heat" class="upcoming-race">
            <div class="upcoming-race-header">
              <div class="event-info">
                <div class="event-name">{{ race.event_name }}</div>
                <div class="heat-info">Heat {{ race.heat || '?' }}<span v-if="race.seed_time" class="seed-time">Seed: {{ race.seed_time }}</span></div>
              </div>
              <div style="display:flex;gap:10px;align-items:center">
                <div class="lane-badge">Lane {{ race.lane || '?' }}</div>
                <div class="eta-badge">~{{ formatETA(getHeatETA(race.event_id, race.heat)) }}</div>
              </div>
            </div>
            <div class="heats-remaining">{{ getHeatsRemaining(race.event_id, race.heat) }} heat{{ getHeatsRemaining(race.event_id, race.heat) !== 1 ? 's' : '' }} until this race</div>
          </div>
        </div>
      </div>

      <div v-if="data.results.length" class="race-panel">
        <div class="section-title">Race Results</div>
        <div v-for="r in sortedResults" :key="r.event_id + r.age_group" class="result-card">
          <div class="result-card-header">
            <div class="result-left">
              <div class="result-place-col">
                <span v-if="isDQ(r)" class="dq-badge">DQ</span>
                <span v-else-if="isDNA(r)" class="dq-badge" style="background:#888">DNA</span>
                <span v-else-if="r.place" :class="['place', placeClass(r.place)]">{{ r.place }}</span>
                <span v-else class="place place-other">—</span>
              </div>
              <div class="result-info">
                <div class="result-event-name">{{ r.event_name.replace(/^\d+\s*/, '') }}</div>
                <div class="result-meta">
                  <span v-if="!data.isRelay" class="result-points">{{ r.age_group || '-' }}</span>
                  <span v-if="r.wa_points" class="result-points">{{ r.wa_points }} pts</span>
                </div>
              </div>
            </div>
            <div class="result-right">
              <div class="result-badges">
                <span v-if="seedDelta(r)" :class="['seed-delta', seedDelta(r)!.same ? 'seed-delta--same' : seedDelta(r)!.improved ? 'seed-delta--improved' : 'seed-delta--slower']">{{ seedDelta(r)!.label }}</span>
                <span v-if="r.place && !isDQ(r) && !isDNA(r)" class="place-context">{{ r.place }} of {{ ageGroupCounts[r.event_id]?.[r.age_group] || '?' }}</span>
              </div>
              <div class="result-time">{{ isDQ(r) || isDNA(r) ? '' : r.time || '-' }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SwimmerData, HeatScheduleItem, SwimResult } from '../types'

const props = defineProps<{
  data: SwimmerData
  heatSchedule: HeatScheduleItem[]
  ageGroupCounts: Record<string, Record<string, number>>
}>()
defineEmits<{ filterClub: [club: string] }>()

const completedRaces = computed(() => props.data.results.filter(r => r.time && !r.time.includes('DQ') && !r.time.includes('DNA')).length)
const goldCount = computed(() => props.data.results.filter(r => r.place === '1').length)
const silverCount = computed(() => props.data.results.filter(r => r.place === '2').length)
const bronzeCount = computed(() => props.data.results.filter(r => r.place === '3').length)
const sortedResults = computed(() => [...props.data.results].sort((a, b) => (parseInt(a.event_id) || 999) - (parseInt(b.event_id) || 999)))
const completedEventIds = computed(() => new Set(props.data.results.map(r => r.event_id)))
const upcomingRaces = computed(() =>
  props.data.startLists
    .filter(s => !completedEventIds.value.has(s.event_id))
    .sort((a, b) => {
      const ai = props.heatSchedule.findIndex(h => h.eventId === a.event_id && h.heat === a.heat)
      const bi = props.heatSchedule.findIndex(h => h.eventId === b.event_id && h.heat === b.heat)
      return ai - bi
    })
)
const currentHeatIndex = computed(() => {
  const i = props.heatSchedule.findIndex(h => !h.isComplete)
  return i === -1 ? props.heatSchedule.length : i
})
const currentHeat = computed(() => props.heatSchedule[currentHeatIndex.value])
const progressPercent = computed(() => props.heatSchedule.length ? (currentHeatIndex.value / props.heatSchedule.length) * 100 : 0)
const nextRaceETA = computed(() => upcomingRaces.value.length ? getHeatETA(upcomingRaces.value[0].event_id, upcomingRaces.value[0].heat) : null)
const heatsUntilNext = computed(() => upcomingRaces.value.length ? getHeatsRemaining(upcomingRaces.value[0].event_id, upcomingRaces.value[0].heat) : 0)

function getHeatETA(eventId: string, heat: string) {
  const target = props.heatSchedule.findIndex(h => h.eventId === eventId && h.heat === heat)
  if (target === -1 || target < currentHeatIndex.value) return null
  let mins = 0
  for (let i = currentHeatIndex.value; i < target; i++) mins += props.heatSchedule[i].heatDuration
  return mins
}
function getHeatsRemaining(eventId: string, heat: string) {
  const target = props.heatSchedule.findIndex(h => h.eventId === eventId && h.heat === heat)
  return Math.max(0, target - currentHeatIndex.value)
}
function formatETA(minutes: number | null) {
  if (minutes === null) return '--'
  if (minutes <= 0) return 'Now!'
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60)
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}
const seedTimeMap = computed(() =>
  Object.fromEntries(props.data.startLists.map(s => [s.event_id, s.seed_time]))
)

function parseSwimTime(t: string): number | null {
  if (!t) return null
  const m = t.trim().match(/^(?:(\d+):)?(\d+)\.(\d+)$/)
  if (!m) return null
  return parseInt(m[1] || '0') * 6000 + parseInt(m[2]) * 100 + parseInt(m[3].padEnd(2, '0').slice(0, 2))
}

function seedDelta(r: SwimResult): { label: string; improved: boolean; same: boolean } | null {
  if (isDQ(r) || isDNA(r) || !r.time) return null
  const seed = parseSwimTime(seedTimeMap.value[r.event_id])
  const actual = parseSwimTime(r.time)
  if (seed === null || actual === null || seed === 0) return null
  const diff = actual - seed
  if (Math.abs(diff) < 5) return { label: '=', improved: false, same: true }
  const sign = diff < 0 ? '-' : '+'
  const abs = Math.abs(diff)
  const delta = `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
  const label = `${diff < 0 ? '↓' : '↑'} ${delta}`
  return { label, improved: diff < 0, same: false }
}

function isDQ(r: SwimResult) { return r.time?.includes('DQ') }
function isDNA(r: SwimResult) { return r.time?.includes('DNA') }
function placeClass(place: string) {
  const n = parseInt(place)
  return n === 1 ? 'place-1' : n === 2 ? 'place-2' : n === 3 ? 'place-3' : 'place-other'
}

</script>

<style>
.swimmer-card { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 25px; margin-bottom: 20px; }
.swimmer-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); }
.swimmer-name { font-size: 1.8rem; color: #00d9ff; margin-bottom: 5px; }
.swimmer-club { color: #888; font-size: 1rem; }
.club-badge { background: rgba(255,193,7,0.2); color: #ffc107; padding: 2px 8px; border-radius: 4px; font-size: 0.85rem; cursor: pointer; }
.club-badge:hover { background: rgba(255,193,7,0.3); }
.relay-badge { background: rgba(138,43,226,0.25); color: #c084fc; font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 2px 7px; border-radius: 4px; vertical-align: middle; margin-left: 8px; }
.section-title { font-size: 1.2rem; color: #fff; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
.section-title::before { content: ''; width: 4px; height: 20px; background: #00d9ff; border-radius: 2px; }
.result-card { background: rgba(0,217,255,0.05); border: 1px solid rgba(0,217,255,0.15); border-radius: 8px; padding: 12px 15px; margin-bottom: 8px; }
.result-card-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.result-event-name { color: #00d9ff; font-weight: 600; margin-bottom: 4px; font-size: 0.95rem; }
.result-meta { display: flex; align-items: center; gap: 8px; }
.result-points { font-size: 0.8rem; color: #666; }
.result-left { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; }
.result-place-col { display: flex; align-items: center; flex-shrink: 0; }
.result-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.result-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.result-time { font-family: 'Monaco', 'Menlo', monospace; font-size: 1.05rem; color: #fff; }
.result-badges { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.place-cell { display: flex; align-items: center; gap: 8px; }
.place { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; font-weight: 700; font-size: 0.9rem; }
.place-1 { background: linear-gradient(135deg, #ffd700, #ffb700); color: #000; }
.place-2 { background: linear-gradient(135deg, #c0c0c0, #a0a0a0); color: #000; }
.place-3 { background: linear-gradient(135deg, #cd7f32, #a0522d); color: #fff; }
.place-other { background: rgba(255,255,255,0.1); color: #888; }
.place-context { font-size: 0.8rem; color: #666; }
.dq-badge { background: #ff4757; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
.age-group-tag { background: rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; color: #888; }
.points { color: #888; font-size: 0.9rem; }
.seed-delta { font-size: 0.75rem; font-family: 'Monaco', 'Menlo', monospace; padding: 2px 6px; border-radius: 4px; margin-left: 6px; font-weight: 600; }
.seed-delta--improved { background: rgba(76,175,80,0.2); color: #4caf50; }
.seed-delta--slower { background: rgba(255,71,87,0.2); color: #ff4757; }
.seed-delta--same { background: rgba(255,255,255,0.08); color: #888; }
.timeline-section { background: rgba(0,217,255,0.05); border: 1px solid rgba(0,217,255,0.2); border-radius: 12px; padding: 20px; margin-bottom: 25px; }
.timeline-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.timeline-title { font-size: 1.1rem; color: #00d9ff; }
.current-event-badge { background: rgba(76,175,80,0.2); color: #4caf50; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; animation: pulse 2s infinite; }
.timeline-track { height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; }
.timeline-progress { height: 100%; background: linear-gradient(90deg, #4caf50, #00d9ff); border-radius: 4px; transition: width 0.5s ease; }
.eta-display { text-align: center; padding: 15px; background: rgba(0,0,0,0.2); border-radius: 8px; margin-top: 15px; }
.eta-label { font-size: 0.85rem; color: #888; margin-bottom: 5px; }
.eta-race-code { font-size: 2rem; font-weight: 700; color: #ffc107; font-family: 'Monaco', 'Menlo', monospace; letter-spacing: 0.05em; }
.eta-detail { font-size: 0.8rem; color: #666; margin-top: 5px; }
.eta-time-inline { color: #888; }
.race-columns { display: flex; flex-direction: column; gap: 0; }
.race-columns--split { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; align-items: start; }
.race-panel { min-width: 0; }
.upcoming-race { background: rgba(76,175,80,0.1); border: 1px solid rgba(76,175,80,0.3); border-radius: 8px; padding: 15px; margin-bottom: 10px; }
.upcoming-race-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.upcoming-race .event-name { color: #4caf50; margin-bottom: 5px; font-weight: 600; }
.upcoming-race .heat-info { color: #888; font-size: 0.9rem; }
.lane-badge { background: rgba(76,175,80,0.2); color: #4caf50; padding: 8px 15px; border-radius: 6px; font-weight: 600; }
.seed-time { color: #888; font-size: 0.85rem; margin-left: 10px; }
.eta-badge { background: rgba(255,193,7,0.2); color: #ffc107; padding: 8px 15px; border-radius: 6px; font-weight: 600; font-family: 'Monaco', 'Menlo', monospace; }
.heats-remaining { font-size: 0.8rem; color: #666; margin-top: 8px; }
@media (max-width: 768px) {
  .swimmer-card { padding: 15px; }
  .swimmer-header { flex-direction: column; gap: 15px; }
  .swimmer-stats { width: 100%; justify-content: space-around; }
  .swimmer-name { font-size: 1.4rem; }
  .race-columns--split { grid-template-columns: 1fr; }
  .race-panel { overflow-x: auto; }
  .results-table { font-size: 0.82rem; min-width: 400px; }
  .results-table th, .results-table td { padding: 8px 6px; }
  .eta-time { font-size: 1.5rem; }
  .timeline-header { flex-direction: column; gap: 8px; align-items: flex-start; }
  .upcoming-race-header { flex-wrap: wrap; gap: 8px; }
  .timeline-section { padding: 14px; }
  .eta-display { padding: 10px; }
}
</style>
