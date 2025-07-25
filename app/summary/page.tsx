'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Calendar from './Calendar'
import DayModal from './DayModal'
import { calculateWorkHours, calculateCallHours } from './utils'
import { format } from 'date-fns'

export default function SummaryPage() {
  const [entries, setEntries] = useState<{ [date: string]: any }>({})
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
    const { data: workLogs } = await supabase
      .from('work_logs')
      .select('start_time')

    const { data: taskLogs } = await supabase
      .from('task_logs')
      .select('start_time, session_id')

    const allDates = [...(workLogs || []), ...(taskLogs || []).filter(t => !t.session_id)].map((entry: any) => new Date(entry.start_time))
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

    const { data: workLogs } = await supabase
      .from('work_logs')
      .select('*')
      .gte('start_time', from.toISOString())
      .lte('end_time', to.toISOString())

    const { data: taskLogs } = await supabase
      .from('task_logs')
      .select('*')
      .gte('start_time', from.toISOString())
      .lte('end_time', to.toISOString())

    const dataMap: { [date: string]: { baseHours: number; overtimeHours: number; callHours: number } } = {}

    // Darbadienas
    workLogs?.forEach(log => {
      const date = format(new Date(log.start_time), 'yyyy-MM-dd')
      const { baseHours, overtimeHours } = calculateWorkHours(new Date(log.start_time), new Date(log.end_time))
      if (!dataMap[date]) dataMap[date] = { baseHours: 0, overtimeHours: 0, callHours: 0 }
      dataMap[date].baseHours += baseHours
      dataMap[date].overtimeHours += overtimeHours
    })

    // Izsaukumi: session_id === null
    const callTasks = (taskLogs || []).filter((t) => !t.session_id)
    const callsByDate: { [date: string]: { start_time: string; end_time: string }[] } = {}

    callTasks.forEach(task => {
      const date = format(new Date(task.start_time), 'yyyy-MM-dd')
      if (!callsByDate[date]) callsByDate[date] = []
      callsByDate[date].push({
        start_time: task.start_time,
        end_time: task.end_time,
      })
    })

    for (const date in callsByDate) {
      const callHours = calculateCallHours(callsByDate[date])
      if (!dataMap[date]) dataMap[date] = { baseHours: 0, overtimeHours: 0, callHours: 0 }
      dataMap[date].callHours += callHours
    }

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
            className="border rounded px-2 py-1"
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
