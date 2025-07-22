export type TimeBreakdown = {
  baseHours: number
  overtimeHours: number
  callHours: number
}

// Palīgfunkcija – noapaļo uz tuvāko 0.25h (15 min)
function roundToQuarterHour(minutes: number): number {
  return Math.round((minutes / 60) * 4) / 4
}

// Stundu sadalīšana darba dienai
export function calculateWorkHours(start: Date, end: Date): {
  baseHours: number
  overtimeHours: number
} {
  const BASE_START = 9
  const BASE_END = 18

  let baseMinutes = 0
  let overtimeMinutes = 0

  const cur = new Date(start)

  while (cur < end) {
    const hour = cur.getHours()
    const next = new Date(cur.getTime() + 15 * 60 * 1000) // +15min

    if (next > end) break

    if (hour >= BASE_START && hour < BASE_END) baseMinutes += 15
    else overtimeMinutes += 15

    cur.setMinutes(cur.getMinutes() + 15)
  }

  return {
    baseHours: roundToQuarterHour(baseMinutes),
    overtimeHours: roundToQuarterHour(overtimeMinutes),
  }
}

// Izsaukumu laika aprēķins
export function calculateCallHours(callTasks: {
  start_time: string
  end_time: string
}[]): number {
  let totalMinutes = 0

  for (const task of callTasks) {
    const start = new Date(task.start_time)
    const end = new Date(task.end_time)
    const diff = (end.getTime() - start.getTime()) / (1000 * 60) // minūtes
    totalMinutes += diff
  }

  return roundToQuarterHour(totalMinutes)
}
