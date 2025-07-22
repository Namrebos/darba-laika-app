'use client'

import React from 'react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  format,
  isSameMonth,
  isSameDay,
} from 'date-fns'

type DayData = {
  baseHours: number
  overtimeHours: number
  callHours: number
}

type CalendarProps = {
  year: number
  month: number // 0-based
  data: { [date: string]: DayData }
  onDayClick: (date: string) => void
}

function formatDuration(hours: number) {
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h > 0 && m > 0) return `${h}h${m}min`
  if (h > 0) return `${h}h`
  return `${m}min`
}

export default function Calendar({ year, month, data, onDayClick }: CalendarProps) {
  const monthStart = startOfMonth(new Date(year, month))
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 })
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const rows = []
  let days = []
  let day = startDate

  while (day <= endDate) {
    for (let i = 0; i < 7; i++) {
      const dateStr = format(day, 'yyyy-MM-dd')
      const entry = data[dateStr]
      const isCurrentMonth = isSameMonth(day, monthStart)
      const isToday = isSameDay(day, new Date())
      const dayNum = day.getDate()

      const base = entry?.baseHours || 0
      const over = entry?.overtimeHours || 0
      const call = entry?.callHours || 0

      const showBase = base >= 0.25
      const showOver = over >= 0.25
      const showCall = call >= 0.25

      const timeTextClass = isToday ? 'text-black' : ''
      const nonCurrentClass = !isCurrentMonth ? 'opacity-30 cursor-default pointer-events-none' : ''
      const borderColor = isToday ? 'border-black' : 'border-black dark:border-white'
      const bgColor = isToday ? 'bg-yellow-100' : ''
      const textColor = isCurrentMonth ? 'text-foreground' : 'text-muted-foreground'

      days.push(
        <div
          key={dateStr}
          onClick={() => isCurrentMonth && onDayClick(dateStr)}
          className={`aspect-square flex flex-col items-center text-sm select-none rounded 
            pt-[15%] pb-[5%] border-[1.5px] ${borderColor} ${bgColor}
            ${textColor} ${nonCurrentClass} ${isCurrentMonth ? 'cursor-pointer hover:bg-muted' : ''}
          `}
        >
          <div className={`text-xl font-bold ${isToday ? 'text-black' : ''}`}>
            {dayNum}
          </div>

          <div className={`flex flex-col items-center justify-center mt-[10%] space-y-[4px] text-[13px] leading-tight ${timeTextClass}`}>
            {showBase && (
              <div className="flex items-center gap-1">
                <div className="w-5 h-5 bg-blue-500 rounded-full" />
                <span>{formatDuration(base)}</span>
              </div>
            )}
            {showOver && (
              <div className="flex items-center gap-1">
                <div className="w-5 h-5 bg-red-500 rounded-full" />
                <span>{formatDuration(over)}</span>
              </div>
            )}
            {showCall && (
              <div className="flex items-center gap-1">
                <div className="w-5 h-5 bg-yellow-400 rounded-full" />
                <span>{formatDuration(call)}</span>
              </div>
            )}
          </div>
        </div>
      )

      day = addDays(day, 1)
    }

    rows.push(
      <div key={day.toString()} className="grid grid-cols-7 gap-1">
        {days}
      </div>
    )
    days = []
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-7 text-center font-semibold text-xs text-muted-foreground">
        <div>P</div><div>O</div><div>T</div><div>C</div><div>Pk</div><div>S</div><div>Sv</div>
      </div>
      {rows}
    </div>
  )
}
