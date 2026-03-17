"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { format } from "date-fns";
import Calendar from "./Calendar";
import DayModal from "./DayModal";
import MonthlySummary from "./MonthlySummary";
import {
  calculateWorkHours,
  calculateTaskHoursByDate,
  roundToQuarterHour,
} from "./utils";

type WorkSegment = {
  startHour: number;
  endHour: number;
};

type DayEntry = {
  baseHours: number;
  overtimeHours: number;
  taskHours?: number;
  workSegments: WorkSegment[];
};

type MonthOption = {
  year: number;
  month: number;
};

type WorkLogRow = {
  start_time: string;
  end_time: string;
};

type TaskLogRow = {
  start_time: string;
  end_time: string | null;
  session_id?: string | null;
};

function ensureDayEntry(map: Record<string, DayEntry>, date: string): DayEntry {
  if (!map[date]) {
    map[date] = {
      baseHours: 0,
      overtimeHours: 0,
      workSegments: [],
    };
  }

  return map[date];
}

function getHourDecimal(date: Date) {
  return (
    date.getHours() +
    date.getMinutes() / 60 +
    date.getSeconds() / 3600 +
    date.getMilliseconds() / 3600000
  );
}

function addWorkSegmentsByDate(
  map: Record<string, DayEntry>,
  start: Date,
  end: Date,
) {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
  if (end <= start) return;

  let currentStart = new Date(start);

  while (currentStart < end) {
    const dayKey = format(currentStart, "yyyy-MM-dd");

    const nextDayStart = new Date(currentStart);
    nextDayStart.setHours(0, 0, 0, 0);
    nextDayStart.setDate(nextDayStart.getDate() + 1);

    const currentEnd = end < nextDayStart ? end : nextDayStart;

    const startHour = getHourDecimal(currentStart);
    const endHour =
      currentEnd.getTime() === nextDayStart.getTime()
        ? 24
        : getHourDecimal(currentEnd);

    ensureDayEntry(map, dayKey).workSegments.push({
      startHour,
      endHour,
    });

    currentStart = currentEnd;
  }
}

export default function SummaryPage() {
  const [entries, setEntries] = useState<Record<string, DayEntry>>({});
  const [availableMonths, setAvailableMonths] = useState<MonthOption[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAvailableMonths();
  }, []);

  useEffect(() => {
    if (availableMonths.length > 0) {
      loadData();
    }
  }, [selectedYear, selectedMonth, availableMonths]);

  async function loadAvailableMonths() {
    const { data: workLogs, error: workError } = await supabase
      .from("work_logs")
      .select("start_time");

    const { data: taskLogs, error: taskError } = await supabase
      .from("task_logs")
      .select("start_time, session_id");

    if (workError || taskError) {
      console.error("Summary month load error:", { workError, taskError });
      setAvailableMonths([]);
      setLoading(false);
      return;
    }

    const allDates = [
      ...((workLogs || []) as { start_time: string }[]).map(
        (w) => new Date(w.start_time),
      ),
      ...((taskLogs || []) as TaskLogRow[]).map((t) => new Date(t.start_time)),
    ];

    const monthSet = new Set<string>();

    allDates.forEach((date) => {
      if (Number.isNaN(date.getTime())) return;
      monthSet.add(`${date.getFullYear()}-${date.getMonth()}`);
    });

    const sorted = Array.from(monthSet)
      .map((key) => {
        const [year, month] = key.split("-").map(Number);
        return { year, month };
      })
      .sort((a, b) => a.year - b.year || a.month - b.month);

    setAvailableMonths(sorted);

    const today = new Date();
    const todayMatch = sorted.find(
      (m) => m.year === today.getFullYear() && m.month === today.getMonth(),
    );

    if (todayMatch) {
      setSelectedYear(todayMatch.year);
      setSelectedMonth(todayMatch.month);
    } else if (sorted.length > 0) {
      const latest = sorted[sorted.length - 1];
      setSelectedYear(latest.year);
      setSelectedMonth(latest.month);
    } else {
      setSelectedYear(today.getFullYear());
      setSelectedMonth(today.getMonth());
    }
  }

  async function loadData() {
    setLoading(true);

    const from = new Date(selectedYear, selectedMonth, 1);
    const nextMonthStart = new Date(selectedYear, selectedMonth + 1, 1);

    const { data: workLogs, error: workError } = await supabase
      .from("work_logs")
      .select("start_time, end_time")
      .gte("start_time", from.toISOString())
      .lt("start_time", nextMonthStart.toISOString());

    const { data: taskLogs, error: taskError } = await supabase
      .from("task_logs")
      .select("start_time, end_time, session_id")
      .gte("start_time", from.toISOString())
      .lt("start_time", nextMonthStart.toISOString());

    if (workError || taskError) {
      console.error("Summary data load error:", { workError, taskError });
      setEntries({});
      setLoading(false);
      return;
    }

    const dataMap: Record<string, DayEntry> = {};

    ((workLogs || []) as WorkLogRow[]).forEach((log) => {
      if (!log.start_time || !log.end_time) return;

      const start = new Date(log.start_time);
      const end = new Date(log.end_time);
      const date = format(start, "yyyy-MM-dd");

      const { baseHours, overtimeHours } = calculateWorkHours(start, end);
      const entry = ensureDayEntry(dataMap, date);

      entry.baseHours += baseHours;
      entry.overtimeHours += overtimeHours;

      addWorkSegmentsByDate(dataMap, start, end);
    });

    const allTasks = (taskLogs || []) as TaskLogRow[];
    const taskByDate = calculateTaskHoursByDate(allTasks);

    Object.entries(taskByDate).forEach(([date, hours]) => {
      const entry = ensureDayEntry(dataMap, date);
      entry.taskHours = (entry.taskHours || 0) + hours;
    });

    setEntries(dataMap);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6 text-foreground">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold">
            {new Date(selectedYear, selectedMonth).toLocaleString("lv-LV", {
              year: "numeric",
              month: "long",
            })}
          </h1>

          <select
            value={`${selectedYear}-${selectedMonth}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              setSelectedYear(y);
              setSelectedMonth(m);
            }}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-black shadow-sm outline-none sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          >
            {availableMonths.map(({ year, month }) => (
              <option
                key={`${year}-${month}`}
                value={`${year}-${month}`}
                className="bg-white text-black dark:bg-zinc-900 dark:text-white"
              >
                {new Date(year, month).toLocaleString("lv-LV", {
                  year: "numeric",
                  month: "long",
                })}
              </option>
            ))}
          </select>
        </div>

        <MonthlySummary data={entries} />

        {loading ? (
          <div className="rounded-xl border border-border bg-card p-6 text-sm">
            Ielādē kalendāru...
          </div>
        ) : (
          <Calendar
            year={selectedYear}
            month={selectedMonth}
            data={entries}
            onDayClick={(date) => setSelectedDate(date)}
          />
        )}

        {selectedDate && (
          <DayModal date={selectedDate} onClose={() => setSelectedDate(null)} />
        )}
      </div>
    </div>
  );
}
