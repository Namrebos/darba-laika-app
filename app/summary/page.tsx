"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { format } from "date-fns";
import { Search, X } from "lucide-react";
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
  id?: number;
  title?: string | null;
  note?: string | null;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchableTasks, setSearchableTasks] = useState<TaskLogRow[]>([]);
  const [ownerId, setOwnerId] = useState("");

  useEffect(() => {
    async function resolveOwner() {
      const { data } = await supabase.rpc("get_accessible_summary_users");
      const users = (data || []) as { id: string; email: string | null }[];
      const requested = new URLSearchParams(window.location.search).get("user") || "";
      const selected = users.some((item) => item.id === requested)
        ? requested
        : users[0]?.id || "";
      setOwnerId(selected);
      if (selected) await loadAvailableMonths(selected);
      else setLoading(false);
    }
    resolveOwner();
  }, []);

  useEffect(() => {
    if (availableMonths.length > 0) {
      loadData(ownerId);
    }
  }, [selectedYear, selectedMonth, availableMonths, ownerId]);

  async function loadAvailableMonths(selectedOwnerId: string) {
    const { data: workLogs, error: workError } = await supabase
      .from("work_logs")
      .select("start_time")
      .eq("user_id", selectedOwnerId);

    const { data: taskLogs, error: taskError } = await supabase
      .from("task_logs")
      .select("id, title, note, start_time, end_time, session_id")
      .eq("user_id", selectedOwnerId)
      .order("start_time", { ascending: false });

    if (workError || taskError) {
      console.error("Summary month load error:", { workError, taskError });
      setAvailableMonths([]);
      setSearchableTasks([]);
      setLoading(false);
      return;
    }

    setSearchableTasks((taskLogs || []) as TaskLogRow[]);

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

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("lv-LV");
    if (!query) return [];

    return searchableTasks.filter((task) => {
      const date = new Date(task.start_time);
      const dateText = Number.isNaN(date.getTime())
        ? ""
        : format(date, "yyyy-MM-dd");
      const searchableText = [task.title, task.note, dateText]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("lv-LV");

      return searchableText.includes(query);
    });
  }, [searchQuery, searchableTasks]);

  async function loadData(selectedOwnerId: string) {
    setLoading(true);

    const from = new Date(selectedYear, selectedMonth, 1);
    const nextMonthStart = new Date(selectedYear, selectedMonth + 1, 1);

    const { data: workLogs, error: workError } = await supabase
      .from("work_logs")
      .select("start_time, end_time")
      .eq("user_id", selectedOwnerId)
      .gte("start_time", from.toISOString())
      .lt("start_time", nextMonthStart.toISOString());

    const { data: taskLogs, error: taskError } = await supabase
      .from("task_logs")
      .select("start_time, end_time, session_id")
      .eq("user_id", selectedOwnerId)
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

        <div className="space-y-3">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              size={20}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Meklēt pēc darba nosaukuma, piezīmēm vai datuma..."
              aria-label="Meklēt veiktajos darbos"
              className="w-full rounded-xl border border-zinc-300 bg-white py-3 pl-11 pr-11 text-black shadow-sm outline-none placeholder:text-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Notīrīt meklēšanu"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {searchQuery.trim() && (
            <div className="overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <div className="border-b border-zinc-200 px-4 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                Atrasti ieraksti: {searchResults.length}
              </div>

              {searchResults.length === 0 ? (
                <p className="px-4 py-5 text-sm text-zinc-600 dark:text-zinc-300">
                  Neviens veiktais darbs neatbilst meklējumam.
                </p>
              ) : (
                <div className="max-h-80 divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-700">
                  {searchResults.map((task) => {
                    const taskDate = new Date(task.start_time);
                    const dateKey = format(taskDate, "yyyy-MM-dd");

                    return (
                      <button
                        key={task.id ?? `${task.start_time}-${task.title}`}
                        type="button"
                        onClick={() => setSelectedDate(dateKey)}
                        className="block w-full px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-medium">
                            {task.title || "Bez nosaukuma"}
                          </span>
                          <span className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">
                            {dateKey} · {format(taskDate, "HH:mm")}
                          </span>
                        </div>
                        {task.note && (
                          <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-300">
                            {task.note}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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

        {selectedDate && ownerId && (
          <DayModal date={selectedDate} ownerId={ownerId} onClose={() => setSelectedDate(null)} />
        )}
      </div>
    </div>
  );
}
