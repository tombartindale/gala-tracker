export interface SwimResult {
  event_id: string; event_name: string; age_group: string; place: string
  name: string; age: string; club: string; time: string; wa_points: string
  split_50: string; timestamp: string
}

export interface StartListEntry {
  event_id: string; event_name: string; heat: string; lane: string
  name: string; age: string; club: string; seed_time: string; timestamp: string
}

export interface SwimmerData {
  displayName: string; club: string; age: string
  results: SwimResult[]; startLists: StartListEntry[]
}

export interface HeatScheduleItem {
  eventId: string; heat: string; eventName: string
  isComplete: boolean; estimatedTime: number; heatDuration: number
}
