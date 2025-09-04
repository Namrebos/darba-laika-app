// app/summary/utils.tsx

export type TimeBreakdown = {
  baseHours: number
  overtimeHours: number
  callHours: number // atstāju saderībai ar tavu Calendar (izsaukumi)
}

// Papildus tips, ja vajag data apvienošanai Summary sadaļā
export type SummaryDayData = {
  baseHours: number
  overtimeHours: number
  taskHours: number    // laiks pavadīts pildot taskus (NE call)
}

/** Noapaļo minūtes uz tuvāko 0.25h (15 min) un atgriež STUNDAS */
export function roundToQuarterHour(minutes: number): number {
  return Math.round((minutes / 60) * 4) / 4
}

/** Stundu sadalīšana vienai darba dienai (9–18 = base, citur = overtime) */
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

/** Izsaukumu (call) laika aprēķins – kopsumma stundās (saderībai ar esošo kodu) */
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

/* ========================= NEW: TASK STUNDAS ========================= */

/**
 * Summē TASK (NE call) stundas pa DIENĀM.
 * Atgriež: { 'YYYY-MM-DD': hours }
 */
export function calculateTaskHoursByDate(taskLogs: Array<{
  start_time: string
  end_time: string | null
  isCall?: boolean
}>): Record<string, number> {
  const byDate: Record<string, number> = {}

  for (const t of taskLogs) {
    if (t.isCall) continue // izsaukumus neieskaitām
    if (!t.start_time) continue

    const start = new Date(t.start_time)
    const end = new Date(t.end_time ?? t.start_time) // ja nav end_time, skaitām 0h

    // Pieņemam, ka viens logs nepārsniedz dienu (kā līdz šim). Ja vajag – var sadalīt pa dienām.
    const dayKey = start.toISOString().slice(0, 10) // YYYY-MM-DD
    const minutes = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60))
    const hours = roundToQuarterHour(minutes)

    byDate[dayKey] = (byDate[dayKey] ?? 0) + hours
  }

  return byDate
}

/** Ērti, ja vajag tikai kopējo task laiku (NE call) stundās */
export function calculateTaskHoursTotal(taskLogs: Array<{
  start_time: string
  end_time: string | null
  isCall?: boolean
}>): number {
  const byDate = calculateTaskHoursByDate(taskLogs)
  return Object.values(byDate).reduce((sum, h) => sum + h, 0)
}

/* ======= (Neobligāti) Work logu agregācija pa dienām – ja noder Summary ======= */

/**
 * Summē WORK_LOGS pa DIENĀM, katram logam pielietojot calculateWorkHours.
 * Atgriež: { 'YYYY-MM-DD': { baseHours, overtimeHours } }
 * Piezīme: pieņemts, ka logs nepārsniedz dienu.
 */
export function calculateWorkHoursByDate(workLogs: Array<{
  start_time: string
  end_time: string
}>): Record<string, { baseHours: number; overtimeHours: number }> {
  const result: Record<string, { baseHours: number; overtimeHours: number }> = {}

  for (const w of workLogs) {
    const start = new Date(w.start_time)
    const end = new Date(w.end_time)

    const { baseHours, overtimeHours } = calculateWorkHours(start, end)
    const dayKey = start.toISOString().slice(0, 10)

    if (!result[dayKey]) {
      result[dayKey] = { baseHours: 0, overtimeHours: 0 }
    }
    result[dayKey].baseHours = roundToQuarterHour((result[dayKey].baseHours + baseHours) * 60)
    result[dayKey].overtimeHours = roundToQuarterHour((result[dayKey].overtimeHours + overtimeHours) * 60)
  }

  return result
}

/**
 * Apvieno work (base+over) ar task (taskHours) vienā mapē pa datumam.
 * Izsaukumi netiek skaitīti.
 */
export function mergeDailySummary(
  work: Record<string, { baseHours: number; overtimeHours: number }>,
  task: Record<string, number>
): Record<string, SummaryDayData> {
  const allDates = new Set([...Object.keys(work || {}), ...Object.keys(task || {})])
  const out: Record<string, SummaryDayData> = {}

  allDates.forEach((d) => {
    out[d] = {
      baseHours: work[d]?.baseHours || 0,
      overtimeHours: work[d]?.overtimeHours || 0,
      taskHours: task[d] || 0,
    }
  })

  return out
}
