'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Calendar from './Calendar'
import DayModal from './DayModal'
import MonthlySummary from './MonthlySummary'
import { calculateWorkHours, calculateTaskHoursByDate } from './utils'
import { format } from 'date-fns'

type DayEntry = {
  baseHours: number
  overtimeHours: number
  // Calendar var ignorēt papildu laukus, bet uzturam API stabilu:
  callHours: number     // = 0 (izsaukumi netiek skaitīti)
  taskHours?: number    // tikai kopsavilkumam; Calendar var neizmantot
}

export default function SummaryPage() {
  const [entries, setEntries] = useState<{ [date: string]: DayEntry }>({})
  const [availableMonths, setAvailableMonths] = useState<{ year: number; month: number }[]>([])
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAvailableMonths()
  }, [])

  useEffect(() => {
    if (availableMonths.length > 0) {
      loadData()
    }
  }, [selectedYear, selectedMonth, availableMonths])

  async function loadAvailableMonths() {
    // Work logi (visi)
    const { data: workLogs } = await supabase
      .from('work_logs')
      .select('start_time')

    // Task logi, kas NAV izsaukumi (isCall != true)
    const { data: taskLogs } = await supabase
      .from('task_logs')
      .select('start_time, isCall')

    const allDates = [
      ...(workLogs || []).map((w: any) => new Date(w.start_time)),
      ...((taskLogs || [])
          .filter((t: any) => !t.isCall)
          .map((t: any) => new Date(t.start_time))),
    ]

    const monthSet = new Set<string>()
    allDates.forEach(date => {
      const y = date.getFullYear()
      const m = date.getMonth()
      monthSet.add(`${y}-${m}`)
    })

    const sorted = Array.from(monthSet).map(key => {
      const [year, month] = key.split('-').map(Number)
      return { year, month }
    }).sort((a, b) => (a.year - b.year) || (a.month - b.month))

    setAvailableMonths(sorted)

    const today = new Date()
    const todayMatch = sorted.find(m => m.year === today.getFullYear() && m.month === today.getMonth())

    if (todayMatch) {
      setSelectedYear(todayMatch.year)
      setSelectedMonth(todayMatch.month)
    } else if (sorted.length > 0) {
      const latest = sorted.at(-1)!
      setSelectedYear(latest.year)
      setSelectedMonth(latest.month)
    }
  }

  async function loadData() {
    setLoading(true)

    const from = new Date(selectedYear, selectedMonth, 1)
    const to = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59)

    // Work logi izvēlētajā periodā
    const { data: workLogs } = await supabase
      .from('work_logs')
      .select('*')
      .gte('start_time', from.toISOString())
      .lte('end_time', to.toISOString())

    // Task logi izvēlētajā periodā (ņemam arī end_time aprēķiniem)
    const { data: taskLogs } = await supabase
      .from('task_logs')
      .select('start_time, end_time, isCall')
      .gte('start_time', from.toISOString())
      .lte('end_time', to.toISOString())

    const dataMap: { [date: string]: DayEntry } = {}

    // 1) Darbadienas (base + over no work_logs)
    workLogs?.forEach((log: any) => {
      const start = new Date(log.start_time)
      const end = new Date(log.end_time)
      const date = format(start, 'yyyy-MM-dd')
      const { baseHours, overtimeHours } = calculateWorkHours(start, end)

      if (!dataMap[date]) dataMap[date] = { baseHours: 0, overtimeHours: 0, callHours: 0 }
      dataMap[date].baseHours += baseHours
      dataMap[date].overtimeHours += overtimeHours
      // callHours paliek 0 — izsaukumi netiek skaitīti
    })

    // 2) Tasku stundas (NE call) no task_logs
    const nonCallTasks = (taskLogs || []).filter((t: any) => !t.isCall)
    const taskByDate = calculateTaskHoursByDate(nonCallTasks) // { 'YYYY-MM-DD': hours }

    Object.entries(taskByDate).forEach(([date, hours]) => {
      if (!dataMap[date]) dataMap[date] = { baseHours: 0, overtimeHours: 0, callHours: 0 }
      dataMap[date].taskHours = (dataMap[date].taskHours || 0) + (hours as number)
    })

    setEntries(dataMap)
    setLoading(false)
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-bold">
          {new Date(selectedYear, selectedMonth).toLocaleString('lv-LV', { year: 'numeric', month: 'long' })}
        </div>
        <div className="flex gap-2">
          <select
            className="border rounded px-2 py-1 bg-white text-black dark:bg-zinc-800 dark:text-white"
            value={`${selectedYear}-${selectedMonth}`}
            onChange={(e) => {
             const [y, m] = e.target.value.split('-').map(Number)
              setSelectedYear(y)
              setSelectedMonth(m)
            }}
          >
            {availableMonths.map(({ year, month }) => (
              <option key={`${year}-${month}`} value={`${year}-${month}`}>
                {new Date(year, month).toLocaleString('lv-LV', { year: 'numeric', month: 'long' })}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mēneša kopsavilkuma tabula */}
      <MonthlySummary data={entries} />

      {loading ? (
        <div>Ielādē kalendāru...</div>
      ) : (
        <Calendar
          year={selectedYear}
          month={selectedMonth}
          data={entries}
          onDayClick={(date) => setSelectedDate(date)}
        />
      )}

      {selectedDate && (
        <DayModal
          date={selectedDate}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  )
}
