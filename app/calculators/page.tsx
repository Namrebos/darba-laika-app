"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { calculateWorkHours } from "@/app/summary/utils";

type SummaryUser = {
  id: string;
  display_name: string;
  email: string | null;
};

type WorkLog = {
  start_time: string;
  end_time: string | null;
};

type MonthHours = {
  regular: number;
  overtime: number;
  workdays: number;
};

const MONTHS = [
  "Janvāris",
  "Februāris",
  "Marts",
  "Aprīlis",
  "Maijs",
  "Jūnijs",
  "Jūlijs",
  "Augusts",
  "Septembris",
  "Oktobris",
  "Novembris",
  "Decembris",
];

const WORK_HOURS_2026 = [168, 160, 176, 158, 152, 159, 184, 168, 176, 176, 159, 158];

const money = new Intl.NumberFormat("lv-LV", {
  style: "currency",
  currency: "EUR",
});

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateNetSalary(
  gross: number,
  taxBookSubmitted: boolean,
  dependants: number,
) {
  const socialTax = roundMoney(gross * 0.105);
  const nonTaxableMinimum = taxBookSubmitted ? 550 : 0;
  const dependantRelief = taxBookSubmitted ? dependants * 250 : 0;
  const taxableIncome = Math.max(
    0,
    gross - socialTax - nonTaxableMinimum - dependantRelief,
  );
  const incomeTax = roundMoney(taxableIncome * 0.255);

  return roundMoney(gross - socialTax - incomeTax);
}

function formatHours(value: number) {
  return `${value.toLocaleString("lv-LV", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} h`;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function CalculatorsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<SummaryUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [hourlyRate, setHourlyRate] = useState(10);
  const [officialHourlyRate, setOfficialHourlyRate] = useState(8.5);
  const [multiplierA, setMultiplierA] = useState(2);
  const [multiplierB, setMultiplierB] = useState(1.5);
  const [taxBookSubmitted, setTaxBookSubmitted] = useState(true);
  const [dependants, setDependants] = useState(0);
  const [paidMeals, setPaidMeals] = useState(false);
  const [mealRate, setMealRate] = useState(6);
  const [hoursByMonth, setHoursByMonth] = useState<MonthHours[]>(
    MONTHS.map(() => ({ regular: 0, overtime: 0, workdays: 0 })),
  );

  useEffect(() => {
    async function initialise() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single();

      if (profile?.role !== "admin") {
        router.replace("/summary");
        return;
      }

      const { data } = await supabase.rpc("get_accessible_summary_users");
      const availableUsers = (data || []) as SummaryUser[];
      setUsers(availableUsers);
      setSelectedUserId(availableUsers[0]?.id || "");
      setAllowed(true);
    }

    initialise();
  }, [router]);

  useEffect(() => {
    if (!selectedUserId) {
      setLoading(false);
      return;
    }

    async function loadHours() {
      setLoading(true);
      const { data, error } = await supabase
        .from("work_logs")
        .select("start_time, end_time")
        .eq("user_id", selectedUserId)
        .gte("start_time", new Date(2026, 0, 1).toISOString())
        .lt("start_time", new Date(2027, 0, 1).toISOString());

      if (error) {
        setHoursByMonth(
          MONTHS.map(() => ({ regular: 0, overtime: 0, workdays: 0 })),
        );
        setLoading(false);
        return;
      }

      const totals = MONTHS.map(() => ({
        regular: 0,
        overtime: 0,
        workdays: new Set<string>(),
      }));
      ((data || []) as WorkLog[]).forEach((log) => {
        if (!log.end_time) return;
        const start = new Date(log.start_time);
        const end = new Date(log.end_time);
        const month = start.getMonth();
        const calculated = calculateWorkHours(start, end);
        totals[month].regular += calculated.baseHours;
        totals[month].overtime += calculated.overtimeHours;
        const dayOfWeek = start.getDay();
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          totals[month].workdays.add(localDateKey(start));
        }
      });
      setHoursByMonth(
        totals.map((hours) => ({
          regular: Math.round(hours.regular),
          overtime: Math.round(hours.overtime),
          workdays: hours.workdays.size,
        })),
      );
      setLoading(false);
    }

    loadHours();
  }, [selectedUserId]);

  const rows = useMemo(
    () =>
      MONTHS.map((month, index) => {
        const regularHours = hoursByMonth[index].regular;
        const overtimeHours = hoursByMonth[index].overtime;
        const normHours = WORK_HOURS_2026[index];

        const fullyOfficial = (multiplier: number) =>
          calculateNetSalary(
            regularHours * hourlyRate +
              overtimeHours * hourlyRate * multiplier,
            taxBookSubmitted,
            dependants,
          );

        const officialPlusExtra = (multiplier: number) => {
          if (regularHours === 0 && overtimeHours === 0) return 0;

          const officialGross = normHours * officialHourlyRate;
          const fullGross =
            regularHours * hourlyRate +
            overtimeHours * hourlyRate * multiplier;
          const extraPart = fullGross - officialGross;

          return roundMoney(
            calculateNetSalary(
              officialGross,
              taxBookSubmitted,
              dependants,
            ) + extraPart,
          );
        };

        return {
          month,
          normHours,
          regularHours,
          overtimeHours,
          fullyOfficialA: fullyOfficial(multiplierA),
          fullyOfficialB: fullyOfficial(multiplierB),
          officialPlusExtraA: officialPlusExtra(multiplierA),
          officialPlusExtraB: officialPlusExtra(multiplierB),
        };
      }),
    [
      dependants,
      hourlyRate,
      hoursByMonth,
      multiplierA,
      multiplierB,
      officialHourlyRate,
      taxBookSubmitted,
    ],
  );

  const totalWorkdays = useMemo(
    () => hoursByMonth.reduce((total, month) => total + month.workdays, 0),
    [hoursByMonth],
  );
  const mealTotal = paidMeals ? roundMoney(totalWorkdays * mealRate) : 0;

  if (!allowed) {
    return <p className="p-6 text-sm text-zinc-500">Pārbauda piekļuvi...</p>;
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">Algu kalkulatori</h1>
        <p className="mt-1 text-sm text-zinc-500">
          2026. gada mēnešu salīdzinājums pēc aplikācijā uzskaitītajām stundām.
        </p>
      </div>

      <div className="grid gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700 sm:grid-cols-2 lg:grid-cols-7">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Lietotājs</span>
          <select
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.display_name || user.email || user.id}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Stundas likme</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={hourlyRate}
            onChange={(event) => setHourlyRate(Math.max(0, Number(event.target.value)))}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Ofic. likme</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={officialHourlyRate}
            onChange={(event) =>
              setOfficialHourlyRate(
                Math.max(0, Number(event.target.value)),
              )
            }
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Koeficients A</span>
          <input
            type="number"
            min="1"
            step="0.5"
            value={multiplierA}
            onChange={(event) => setMultiplierA(Math.max(1, Number(event.target.value)))}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Koeficients B</span>
          <input
            type="number"
            min="1"
            step="0.5"
            value={multiplierB}
            onChange={(event) => setMultiplierB(Math.max(1, Number(event.target.value)))}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Apgādājamie</span>
          <input
            type="number"
            min="0"
            step="1"
            value={dependants}
            onChange={(event) => setDependants(Math.max(0, Math.floor(Number(event.target.value))))}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
          />
        </label>

        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={taxBookSubmitted}
            onChange={(event) => setTaxBookSubmitted(event.target.checked)}
          />
          <span className="text-sm">Algas nodokļa grāmatiņa ir iesniegta</span>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="w-full min-w-[1250px] border-collapse text-sm">
          <thead className="bg-zinc-100 dark:bg-zinc-800">
            <tr>
              <th rowSpan={2} className="border-b border-r border-zinc-300 p-3 text-left dark:border-zinc-700">Mēnesis</th>
              <th rowSpan={2} className="border-b border-r border-zinc-300 p-3 text-right dark:border-zinc-700">Norma</th>
              <th rowSpan={2} className="border-b border-r border-zinc-300 p-3 text-right dark:border-zinc-700">Darba stundas</th>
              <th rowSpan={2} className="border-b border-r border-zinc-300 p-3 text-right dark:border-zinc-700">Virsstundas</th>
              <th colSpan={2} className="border-b border-r border-zinc-300 p-3 text-center dark:border-zinc-700">Visa alga oficiāla</th>
              <th colSpan={2} className="border-b border-zinc-300 p-3 text-center dark:border-zinc-700">Saliktā alga</th>
            </tr>
            <tr>
              <th className="border-b border-r border-zinc-300 p-3 text-right dark:border-zinc-700">Virsst. {multiplierA}×</th>
              <th className="border-b border-r border-zinc-300 p-3 text-right dark:border-zinc-700">Virsst. {multiplierB}×</th>
              <th className="border-b border-r border-zinc-300 p-3 text-right dark:border-zinc-700">Virsst. {multiplierA}×</th>
              <th className="border-b border-zinc-300 p-3 text-right dark:border-zinc-700">Virsst. {multiplierB}×</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month} className="odd:bg-white even:bg-zinc-50 dark:odd:bg-zinc-950 dark:even:bg-zinc-900">
                <td className="border-r border-zinc-200 p-3 font-medium dark:border-zinc-800">{row.month}</td>
                <td className="border-r border-zinc-200 p-3 text-right dark:border-zinc-800">{formatHours(row.normHours)}</td>
                <td className="border-r border-zinc-200 p-3 text-right dark:border-zinc-800">{formatHours(row.regularHours)}</td>
                <td className="border-r border-zinc-200 p-3 text-right dark:border-zinc-800">{formatHours(row.overtimeHours)}</td>
                <td className="border-r border-zinc-200 p-3 text-right font-semibold dark:border-zinc-800">{money.format(row.fullyOfficialA)}</td>
                <td className="border-r border-zinc-200 p-3 text-right font-semibold dark:border-zinc-800">{money.format(row.fullyOfficialB)}</td>
                <td className="border-r border-zinc-200 p-3 text-right font-semibold dark:border-zinc-800">{money.format(row.officialPlusExtraA)}</td>
                <td className="p-3 text-right font-semibold">{money.format(row.officialPlusExtraB)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pusdienas</h2>
        <div className="grid items-end gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700 sm:grid-cols-4">
          <label className="flex min-h-10 items-center gap-2">
            <input
              type="checkbox"
              checked={paidMeals}
              onChange={(event) => setPaidMeals(event.target.checked)}
              className="h-5 w-5"
            />
            <span className="text-sm font-medium">Apmaksātas pusdienas</span>
          </label>

          <label className="space-y-1">
            <span className="block text-sm font-medium">Likme dienā</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={mealRate}
              onChange={(event) =>
                setMealRate(Math.max(0, Number(event.target.value)))
              }
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
            />
          </label>

          <div>
            <span className="block text-sm font-medium">Darba dienu skaits</span>
            <p className="mt-1 rounded border border-zinc-300 px-3 py-2 text-right dark:border-zinc-600">
              {totalWorkdays}
            </p>
          </div>

          <div>
            <span className="block text-sm font-medium">Summa</span>
            <p className="mt-1 rounded border border-zinc-300 px-3 py-2 text-right font-bold dark:border-zinc-600">
              {money.format(mealTotal)}
            </p>
          </div>
        </div>
      </section>

      {loading && <p className="text-sm text-zinc-500">Atjauno stundu datus...</p>}

      <div className="space-y-1 text-xs text-zinc-500">
        <p>
          Oficiālajai neto algai izmantots: darbinieka VSAOI 10,5%, IIN 25,5%,
          neapliekamais minimums 550 € un 250 € atvieglojums par apgādājamo.
        </p>
        <p>
          Aprēķins ir informatīvs un neaizstāj grāmatvedības algas aprēķinu.
        </p>
      </div>
    </div>
  );
}
