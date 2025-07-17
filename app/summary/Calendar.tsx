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

      days.push(
        <div
          key={dateStr}
          onClick={() => isCurrentMonth && onDayClick(dateStr)}
          className={`aspect-square flex flex-col items-center text-sm cursor-pointer select-none rounded 
            pt-[15%] pb-[5%] border-[1.5px]
            ${isToday ? 'bg-yellow-100 border-black' : 'border-black dark:border-border'}
            ${isCurrentMonth ? 'text-foreground' : 'text-muted-foreground'} hover:bg-muted`}
        >
          <div className="text-xl font-bold">{dayNum}</div>
          <div className="flex gap-1 mt-auto">
            {entry?.baseHours > 0 && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
            {entry?.overtimeHours > 0 && <div className="w-2 h-2 bg-red-500 rounded-full" />}
            {entry?.callHours > 0 && <div className="w-2 h-2 bg-yellow-400 rounded-full" />}
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
