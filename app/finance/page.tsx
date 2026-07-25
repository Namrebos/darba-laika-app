"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { calculateWorkHours } from "@/app/summary/utils";

type WorkLog = {
  start_time: string;
  end_time: string | null;
};

type MonthTotal = {
  key: string;
  label: string;
  hours: number;
  workdays: number;
};

const monthFormatter = new Intl.DateTimeFormat("lv-LV", {
  month: "long",
  year: "numeric",
});

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function FinancePage() {
  const [eightHourWorkday, setEightHourWorkday] = useState(false);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageKey, setStorageKey] = useState("");

  useEffect(() => {
    async function loadData() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setLoading(false);
        return;
      }

      const key = `finance-eight-hour-workday:${authData.user.id}`;
      setStorageKey(key);
      setEightHourWorkday(localStorage.getItem(key) === "true");

      const { data } = await supabase
        .from("work_logs")
        .select("start_time, end_time")
        .eq("user_id", authData.user.id)
        .order("start_time", { ascending: false });

      setWorkLogs((data || []) as WorkLog[]);
      setLoading(false);
    }

    loadData();
  }, []);

  const monthTotals = useMemo(() => {
    const totals = new Map<
      string,
      { date: Date; hours: number; workdays: Set<string> }
    >();

    workLogs.forEach((log) => {
      if (!log.end_time) return;

      const start = new Date(log.start_time);
      const end = new Date(log.end_time);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

      const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
      const current = totals.get(key) || {
        date: new Date(start.getFullYear(), start.getMonth(), 1),
        hours: 0,
        workdays: new Set<string>(),
      };
      current.hours += calculateWorkHours(start, end).baseHours;
      const dayOfWeek = start.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        current.workdays.add(localDateKey(start));
      }
      totals.set(key, current);
    });

    return Array.from(totals.entries())
      .map(([key, total]): MonthTotal => ({
        key,
        label: monthFormatter.format(total.date),
        hours: Math.round(total.hours),
        workdays: total.workdays.size,
      }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [workLogs]);

  function toggleEightHourWorkday(checked: boolean) {
    setEightHourWorkday(checked);
    if (storageKey) localStorage.setItem(storageKey, String(checked));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-2xl font-bold">Finanses</h1>

      <label className="flex items-center gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
        <input
          type="checkbox"
          checked={eightHourWorkday}
          onChange={(event) => toggleEightHourWorkday(event.target.checked)}
          className="h-5 w-5"
        />
        <span className="font-medium">8 stundu darbadiena</span>
      </label>

      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 dark:bg-zinc-800">
            <tr>
              <th className="p-3 text-left">Mēnesis</th>
              <th className="p-3 text-right">Darba dienas</th>
              <th className="p-3 text-right">Darba stundas</th>
            </tr>
          </thead>
          <tbody>
            {monthTotals.map((month) => {
              const adjustedHours = Math.max(
                0,
                month.hours - (eightHourWorkday ? month.workdays : 0),
              );

              return (
                <tr
                  key={month.key}
                  className="border-t border-zinc-200 dark:border-zinc-700"
                >
                  <td className="p-3 capitalize">{month.label}</td>
                  <td className="p-3 text-right">{month.workdays}</td>
                  <td className="p-3 text-right font-semibold">
                    {adjustedHours} h
                  </td>
                </tr>
              );
            })}
            {!loading && monthTotals.length === 0 && (
              <tr>
                <td className="p-4 text-zinc-500" colSpan={3}>
                  Nav darba stundu datu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && <p className="text-sm text-zinc-500">Ielādē datus...</p>}
    </div>
  );
}
