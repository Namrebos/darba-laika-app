'use client'

import React from 'react'
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isWeekend,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { Aldrich } from 'next/font/google'

const dateFont = Aldrich({
  subsets: ['latin'],
  weight: ['400'],
})

type WorkSegment = {
  startHour: number
  endHour: number
}

type DayData = {
  baseHours: number
  overtimeHours: number
  callHours: number
  taskHours?: number
  workSegments: WorkSegment[]
}

type CalendarProps = {
  year: number
  month: number // 0-based
  data: { [date: string]: DayData }
  onDayClick: (date: string) => void
}

type ColoredPart = {
  startHour: number
  endHour: number
  color: 'blue' | 'red'
}

type FlaskProps = {
  workSegments: WorkSegment[]
  isWeekendDay: boolean
  isHoliday: boolean
  isCurrentMonth: boolean
  isToday: boolean
}

const VISUAL_9 = 6
const VISUAL_18 = 15

function clampHour(value: number) {
  return Math.max(0, Math.min(24, value))
}

function toVisualHour(realHour: number) {
  const h = clampHour(realHour)

  if (h <= 9) {
    return (h / 9) * VISUAL_9
  }

  if (h <= 18) {
    return VISUAL_9 + ((h - 9) / 9) * (VISUAL_18 - VISUAL_9)
  }

  return VISUAL_18 + ((h - 18) / 6) * (24 - VISUAL_18)
}

function hourToBottomPercent(hour: number) {
  return (hour / 24) * 100
}

function getSegmentStyle(startHour: number, endHour: number) {
  const visualStart = toVisualHour(startHour)
  const visualEnd = toVisualHour(endHour)

  return {
    bottom: `${hourToBottomPercent(visualStart)}%`,
    height: `${hourToBottomPercent(visualEnd - visualStart)}%`,
  }
}

function splitSegmentByWorkHours(segment: WorkSegment): ColoredPart[] {
  const start = clampHour(segment.startHour)
  const end = clampHour(segment.endHour)

  if (end <= start) return []

  return [
  {
    startHour: start,
    endHour: Math.min(end, 9),
    color: 'red' as const,
  },
  {
    startHour: Math.max(start, 9),
    endHour: Math.min(end, 18),
    color: 'blue' as const,
  },
  {
    startHour: Math.max(start, 18),
    endHour: end,
    color: 'red' as const,
  },
].filter((part) => part.endHour > part.startHour)
}

function resolveColoredParts(
  segment: WorkSegment,
  isWeekendDay: boolean,
  isHoliday: boolean
): ColoredPart[] {
  if (isWeekendDay || isHoliday) {
    return [
      {
        startHour: segment.startHour,
        endHour: segment.endHour,
        color: 'red' as const,
      },
    ]
  }

  return splitSegmentByWorkHours(segment)
}

function getColorClass(color: 'blue' | 'red') {
  return color === 'blue' ? 'bg-blue-500' : 'bg-red-500'
}

function getEasterSunday(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1

  return new Date(year, month - 1, day)
}

function isSameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function getSecondSundayOfMay(year: number) {
  const date = new Date(year, 4, 1)
  const firstSundayOffset = (7 - date.getDay()) % 7
  const firstSunday = 1 + firstSundayOffset
  const secondSunday = firstSunday + 7
  return new Date(year, 4, secondSunday)
}

function getPentecostSunday(year: number) {
  const easter = getEasterSunday(year)
  const result = new Date(easter)
  result.setDate(result.getDate() + 49)
  return result
}

function isLatviaHoliday(date: Date) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()

  const fixedHolidays = new Set([
    '1-1',
    '5-1',
    '5-4',
    '6-23',
    '6-24',
    '11-18',
    '12-24',
    '12-25',
    '12-26',
    '12-31',
  ])

  if (fixedHolidays.has(`${month}-${day}`)) return true

  const easterSunday = getEasterSunday(year)
  const goodFriday = new Date(easterSunday)
  goodFriday.setDate(goodFriday.getDate() - 2)

  const easterMonday = new Date(easterSunday)
  easterMonday.setDate(easterMonday.getDate() + 1)

  const mothersDay = getSecondSundayOfMay(year)
  const pentecostSunday = getPentecostSunday(year)

  return (
    isSameDate(date, goodFriday) ||
    isSameDate(date, easterSunday) ||
    isSameDate(date, easterMonday) ||
    isSameDate(date, mothersDay) ||
    isSameDate(date, pentecostSunday)
  )
}

function formatHourLabel(hour: number) {
  const clamped = clampHour(hour)

  if (clamped === 24) return '24:00'

  let wholeHours = Math.floor(clamped)
  let minutes = Math.round((clamped - wholeHours) * 60)

  if (minutes === 60) {
    wholeHours += 1
    minutes = 0
  }

  const hh = String(wholeHours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')

  return `${hh}:${mm}`
}

function formatSegmentRange(segment: WorkSegment) {
  return `${formatHourLabel(segment.startHour)}–${formatHourLabel(segment.endHour)}`
}

function Flask({
  workSegments,
  isWeekendDay,
  isHoliday,
  isCurrentMonth,
  isToday,
}: FlaskProps) {
  const coloredParts = workSegments.flatMap((segment) =>
    resolveColoredParts(segment, isWeekendDay, isHoliday)
  )

  const borderClass = isToday ? 'border-black' : 'border-zinc-500'
  const lineClass = isCurrentMonth ? 'border-black' : 'border-zinc-500/80'
  const opacityClass = isCurrentMonth ? 'opacity-100' : 'opacity-35'

  return (
    <div
      className={`relative h-[46px] w-[10px] sm:h-[72px] sm:w-[16px] lg:h-[100px] lg:w-[22px] xl:h-[110px] xl:w-[24px] ${opacityClass}`}
    >
      <div
        className={`absolute inset-0 overflow-hidden rounded-[8px] border bg-white transition-all duration-200 sm:rounded-[12px] sm:border-2 group-hover:border-zinc-700 ${borderClass}`}
      >
        {coloredParts.map((part, index) => (
          <div
            key={`${part.startHour}-${part.endHour}-${index}`}
            className={`absolute left-0 right-0 ${getColorClass(part.color)}`}
            style={getSegmentStyle(part.startHour, part.endHour)}
          />
        ))}

        <div
          className={`absolute left-0 right-0 z-20 border-t ${lineClass} sm:border-t-2`}
          style={{ bottom: `${hourToBottomPercent(VISUAL_9)}%` }}
        />

        <div
          className={`absolute left-0 right-0 z-20 border-t ${lineClass} sm:border-t-2`}
          style={{ bottom: `${hourToBottomPercent(VISUAL_18)}%` }}
        />

        <div className="pointer-events-none absolute bottom-[1px] left-[1px] top-[1px] z-30 w-[2px] rounded-full bg-white/35 sm:bottom-[2px] sm:left-[2px] sm:top-[2px] sm:w-[5px] sm:blur-[0.5px]" />
        <div className="pointer-events-none absolute left-[2px] right-[2px] top-[2px] h-[6px] rounded-t-[5px] bg-white/20 sm:left-[3px] sm:right-[3px] sm:h-[12px] sm:rounded-t-[8px]" />
      </div>
    </div>
  )
}

type CalendarDayCellProps = {
  day: Date
  data?: DayData
  isCurrentMonth: boolean
  isToday: boolean
  onClick: () => void
}

function CalendarDayCell({
  day,
  data,
  isCurrentMonth,
  isToday,
  onClick,
}: CalendarDayCellProps) {
  const weekendDay = isWeekend(day)
  const holiday = isLatviaHoliday(day)
  const dayNum = day.getDate()
  const workSegments = data?.workSegments || []
  const showTooltip = isCurrentMonth && workSegments.length > 0

  const cardBorder = isToday ? 'border-black' : 'border-zinc-500'
  const cardBg = isToday
    ? 'bg-gradient-to-br from-yellow-50 to-yellow-100'
    : 'bg-gradient-to-br from-zinc-100 to-zinc-200'
  const opacityClass = isCurrentMonth ? 'opacity-100' : 'opacity-35'
  const textColor = holiday
    ? 'text-red-600'
    : isCurrentMonth
      ? 'text-zinc-900'
      : 'text-zinc-500'

  return (
    <div className="group relative min-w-0">
      {showTooltip && (
        <div className="pointer-events-none absolute -top-2 left-1/2 z-50 hidden w-max max-w-[220px] -translate-x-1/2 -translate-y-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-all duration-150 sm:block group-hover:opacity-100">
          <div className="space-y-1">
            {workSegments.map((segment, index) => (
              <div key={`${segment.startHour}-${segment.endHour}-${index}`}>
                {formatSegmentRange(segment)}
              </div>
            ))}
          </div>
          <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-zinc-700 bg-zinc-900" />
        </div>
      )}

      <div
        onClick={() => isCurrentMonth && onClick()}
        className={`grid min-w-0 h-[58px] grid-cols-[12px_1fr] items-center gap-[3px] rounded-md border px-[4px] py-[4px] shadow-sm transition-all duration-200
          sm:h-[88px] sm:grid-cols-[18px_1fr] sm:gap-1 sm:rounded-xl sm:px-2 sm:py-2
          lg:h-[126px] lg:grid-cols-[24px_1fr] lg:px-3 lg:py-3
          xl:h-[140px] xl:grid-cols-[26px_1fr]
          ${cardBorder} ${cardBg} ${opacityClass}
          ${isCurrentMonth ? 'cursor-pointer sm:hover:-translate-y-1 sm:hover:shadow-md' : 'pointer-events-none cursor-default'}
        `}
      >
        <div className="flex justify-start">
          <Flask
            workSegments={workSegments}
            isWeekendDay={weekendDay}
            isHoliday={holiday}
            isCurrentMonth={isCurrentMonth}
            isToday={isToday}
          />
        </div>

        <div
          className={`${dateFont.className} w-full min-w-0 text-right text-[18px] leading-none [font-variant-numeric:tabular-nums] sm:text-[28px] lg:text-[62px] xl:text-[82px] ${textColor}`}
        >
          {dayNum}
        </div>
      </div>
    </div>
  )
}

export default function Calendar({
  year,
  month,
  data,
  onDayClick,
}: CalendarProps) {
  const monthStart = startOfMonth(new Date(year, month))
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 })
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const rows = []
  let days = []
  let day = startDate

  while (day <= endDate) {
    for (let i = 0; i < 7; i++) {
      const currentDay = day
      const dateStr = format(currentDay, 'yyyy-MM-dd')
      const entry = data[dateStr]
      const isCurrentMonth = isSameMonth(currentDay, monthStart)
      const isToday = isSameDay(currentDay, new Date())

      days.push(
        <CalendarDayCell
          key={dateStr}
          day={currentDay}
          data={entry}
          isCurrentMonth={isCurrentMonth}
          isToday={isToday}
          onClick={() => onDayClick(dateStr)}
        />
      )

      day = addDays(day, 1)
    }

    rows.push(
      <div key={day.toString()} className="grid grid-cols-7 gap-[2px] sm:gap-2">
        {days}
      </div>
    )

    days = []
  }

  return (
    <div className="space-y-1 sm:space-y-2">
      <div className="grid grid-cols-7 text-center text-[9px] font-semibold text-muted-foreground sm:text-xs">
        <div>P</div>
        <div>O</div>
        <div>T</div>
        <div>C</div>
        <div>Pk</div>
        <div>S</div>
        <div>Sv</div>
      </div>

      {rows}
    </div>
  )
}