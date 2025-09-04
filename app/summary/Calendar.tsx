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
import { lv } from 'date-fns/locale'

type DayData = {
  baseHours: number
  overtimeHours: number
  callHours?: number // ignorējam, ja nav vajadzīgs
  taskHours?: number // netiek rādīts kalendārā
}

type CalendarProps = {
  year: number
  month: number // 0-based
  data: { [date: string]: DayData }
  onDayClick: (date: string) => void
}

function hoursToShort(h: number) {
  const totalMin = Math.round((h || 0) * 60)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  if (hh > 0 && mm > 0) return `${hh}h${mm}m`
  if (hh > 0) return `${hh}h`
  if (mm > 0) return `${mm}m`
  return ''
}

export default function Calendar({ year, month, data, onDayClick }: CalendarProps) {
  const currentMonth = new Date(year, month, 1)
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(monthStart)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const days: Date[] = []
  let day = gridStart
  while (day <= gridEnd) {
    days.push(day)
    day = addDays(day, 1)
  }

  const weekLabels = ['P', 'O', 'T', 'C', 'Pk', 'S', 'Sv']

  return (
    <div className="w-full">
      {/* Nedēļu virsraksti */}
      <div className="grid grid-cols-7 gap-2 mb-2 text-xs sm:text-sm text-gray-400">
        {weekLabels.map((w) => (
          <div key={w} className="text-center">{w}</div>
        ))}
      </div>

      {/* Kalendāra režģis: vienmērīgi KVADRĀTISKI lauki (strādā arī mobilajā) */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const dateKey = format(d, 'yyyy-MM-dd')
          const inMonth = isSameMonth(d, monthStart)
          const isToday = isSameDay(d, new Date())
          const entry = data?.[dateKey]

          // kvadrāts ar pielāgojamu saturu iekšā
          return (
            <button
              key={dateKey}
              onClick={() => inMonth && onDayClick(dateKey)}
              disabled={!inMonth}
              className={[
                'relative rounded-lg border transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-cyan-500',
                inMonth
                  ? 'border-zinc-600 hover:border-cyan-500'
                  : 'border-zinc-800 opacity-60 cursor-default',
                isToday ? 'ring-2 ring-cyan-500' : '',
              ].join(' ')}
            >
              {/* Uztur kvadrāta proporciju (pt-100% hack) */}
              <div className="pt-[100%]" />
              {/* Saturs absolūti centrēts iekš kvadrāta */}
              <div className="absolute inset-0 p-1.5 sm:p-2 flex flex-col">
                {/* Augšā — datuma cipars */}
                <div className="text-[10px] sm:text-xs text-gray-300">
                  {format(d, 'd', { locale: lv })}
                </div>

                {/* Apakšā — stundu punkti/teksti; salikti vienādi, lai nelēkātu */}
                <div className="mt-auto flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-[10px] sm:text-xs text-blue-300 leading-none">
                      {hoursToShort(entry?.baseHours || 0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-[10px] sm:text-xs text-red-300 leading-none">
                      {hoursToShort(entry?.overtimeHours || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
