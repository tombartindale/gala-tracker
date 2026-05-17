<template>
  <div class="swimmer-card">
    <div class="swimmer-header">
      <div>
        <h2 class="swimmer-name">{{ data.displayName }}</h2>
        <p class="swimmer-club">
          <span v-if="data.club" class="club-badge" @click="$emit('filterClub', data.club)">{{ data.club }}</span>
          <span v-else>Unknown Club</span>
          <span v-if="data.age"> • Age {{ data.age }}</span>
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
        <div class="eta-label">Next Race In</div>
        <div class="eta-time">{{ formatETA(nextRaceETA) }}</div>
        <div class="eta-detail">
          {{ heatsUntilNext }} heat{{ heatsUntilNext !== 1 ? 's' : '' }} remaining •
          Event {{ upcomingRaces[0].event_id }} Heat {{ upcomingRaces[0].heat }}
        </div>
      </div>
    </div>

    <template v-if="upcomingRaces.length">
      <div class="section-title">Upcoming Races</div>
      <div style="margin-bottom:25px">
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
    </template>

    <template v-if="data.results.length">
      <div class="section-title">Race Results</div>
      <table class="results-table">
        <thead>
          <tr>
            <th>Place (in Age Group)</th><th>Event</th><th>Age Group</th><th>Time</th><th>Points</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in sortedResults" :key="r.event_id + r.age_group">
            <td>
              <div class="place-cell">
                <span v-if="isDQ(r)" class="dq-badge">DQ</span>
                <span v-else-if="isDNA(r)" class="dq-badge" style="background:#888">DNA</span>
                <span v-else-if="r.place" :class="['place', placeClass(r.place)]">{{ r.place }}</span>
                <span v-else>-</span>
                <span v-if="r.place && !isDQ(r) && !isDNA(r)" class="place-context">of {{ ageGroupCounts[r.event_id]?.[r.age_group] || '?' }}</span>
              </div>
            </td>
            <td class="event-name">{{ r.event_name.replace(/^\d+\s*/, '') }}</td>
            <td><span class="age-group-tag">{{ r.age_group || '-' }}</span></td>
            <td class="time">{{ isDQ(r) || isDNA(r) ? '-' : r.time || '-' }}</td>
            <td class="points">{{ r.wa_points || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </template>
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
.section-title { font-size: 1.2rem; color: #fff; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
.section-title::before { content: ''; width: 4px; height: 20px; background: #00d9ff; border-radius: 2px; }
.results-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
.results-table th { text-align: left; padding: 12px 15px; background: rgba(0,0,0,0.3); color: #888; font-weight: 600; font-size: 0.8rem; text-transform: uppercase; }
.results-table td { padding: 12px 15px; border-bottom: 1px solid rgba(255,255,255,0.05); }
.results-table tr:hover td { background: rgba(255,255,255,0.02); }
.event-name { font-weight: 500; }
.time { font-family: 'Monaco', 'Menlo', monospace; font-size: 1.1rem; color: #00d9ff; }
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
.timeline-section { background: rgba(0,217,255,0.05); border: 1px solid rgba(0,217,255,0.2); border-radius: 12px; padding: 20px; margin-bottom: 25px; }
.timeline-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.timeline-title { font-size: 1.1rem; color: #00d9ff; }
.current-event-badge { background: rgba(76,175,80,0.2); color: #4caf50; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; animation: pulse 2s infinite; }
.timeline-track { height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; }
.timeline-progress { height: 100%; background: linear-gradient(90deg, #4caf50, #00d9ff); border-radius: 4px; transition: width 0.5s ease; }
.eta-display { text-align: center; padding: 15px; background: rgba(0,0,0,0.2); border-radius: 8px; margin-top: 15px; }
.eta-label { font-size: 0.85rem; color: #888; margin-bottom: 5px; }
.eta-time { font-size: 2rem; font-weight: 700; color: #ffc107; font-family: 'Monaco', 'Menlo', monospace; }
.eta-detail { font-size: 0.8rem; color: #666; margin-top: 5px; }
.upcoming-race { background: rgba(76,175,80,0.1); border: 1px solid rgba(76,175,80,0.3); border-radius: 8px; padding: 15px; margin-bottom: 10px; }
.upcoming-race-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.upcoming-race .event-name { color: #4caf50; margin-bottom: 5px; font-weight: 600; }
.upcoming-race .heat-info { color: #888; font-size: 0.9rem; }
.lane-badge { background: rgba(76,175,80,0.2); color: #4caf50; padding: 8px 15px; border-radius: 6px; font-weight: 600; }
.seed-time { color: #888; font-size: 0.85rem; margin-left: 10px; }
.eta-badge { background: rgba(255,193,7,0.2); color: #ffc107; padding: 8px 15px; border-radius: 6px; font-weight: 600; font-family: 'Monaco', 'Menlo', monospace; }
.heats-remaining { font-size: 0.8rem; color: #666; margin-top: 8px; }
@media (max-width: 768px) { .swimmer-header { flex-direction: column; gap: 15px; } .swimmer-stats { width: 100%; justify-content: space-around; } .results-table { font-size: 0.9rem; } .results-table th, .results-table td { padding: 10px 8px; } .eta-time { font-size: 1.5rem; } }
</style>
