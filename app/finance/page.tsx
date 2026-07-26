"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Check, Trash2 } from "lucide-react";

type Expense = {
  id: number;
  name: string;
  amount: number;
  created_at: string;
};

function getCurrentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Riga",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}-01`;
}

export default function FinancePage() {
  const [eightHourWorkday, setEightHourWorkday] = useState(false);
  const [storageKey, setStorageKey] = useState("");
  const [userId, setUserId] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseName, setExpenseName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadFinance() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;

      setUserId(data.user.id);
      const key = `finance-eight-hour-workday:${data.user.id}`;
      setStorageKey(key);
      setEightHourWorkday(localStorage.getItem(key) === "true");

      const { data: expenseData, error: expenseError } = await supabase
        .from("monthly_expenses")
        .select("id, name, amount, created_at")
        .eq("user_id", data.user.id)
        .eq("expense_month", getCurrentMonth())
        .order("created_at", { ascending: true });

      if (expenseError) {
        setError("Neizdevās ielādēt izdevumus.");
        return;
      }

      setExpenses((expenseData || []).map((item) => ({
        ...item,
        amount: Number(item.amount),
      })));
    }

    loadFinance();
  }, []);

  function toggleEightHourWorkday(checked: boolean) {
    setEightHourWorkday(checked);
    if (storageKey) localStorage.setItem(storageKey, String(checked));
  }

  async function saveExpense(event: React.FormEvent) {
    event.preventDefault();
    const name = expenseName.trim();
    const amount = Number(expenseAmount.replace(",", "."));

    if (!name || !Number.isFinite(amount) || amount <= 0 || !userId) {
      setError("Ievadi izdevuma nosaukumu un summu.");
      return;
    }

    setSaving(true);
    setError("");
    const { data, error: saveError } = await supabase
      .from("monthly_expenses")
      .insert({
        user_id: userId,
        name,
        amount,
        expense_month: getCurrentMonth(),
      })
      .select("id, name, amount, created_at")
      .single();

    setSaving(false);
    if (saveError || !data) {
      setError("Neizdevās saglabāt izdevumu.");
      return;
    }

    setExpenses((current) => [
      ...current,
      { ...data, amount: Number(data.amount) },
    ]);
    setExpenseName("");
    setExpenseAmount("");
  }

  async function deleteExpense(expense: Expense) {
    const confirmed = window.confirm(
      `Vai tiešām dzēst izdevumu “${expense.name}”?`,
    );
    if (!confirmed) return;

    setError("");
    const { error: deleteError } = await supabase
      .from("monthly_expenses")
      .delete()
      .eq("id", expense.id)
      .eq("user_id", userId);

    if (deleteError) {
      setError("Neizdevās izdzēst izdevumu.");
      return;
    }

    setExpenses((current) =>
      current.filter((item) => item.id !== expense.id),
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <label className="flex items-center gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
        <input
          type="checkbox"
          checked={eightHourWorkday}
          onChange={(event) => toggleEightHourWorkday(event.target.checked)}
          className="h-5 w-5"
        />
        <span className="font-medium">8 stundu darbadiena</span>
      </label>

      <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
        <form
          onSubmit={saveExpense}
          className="flex items-center gap-2 p-3 sm:gap-3 sm:p-4"
        >
          <h2 className="shrink-0 font-semibold sm:text-lg">Izdevumi</h2>
          <input
            type="text"
            value={expenseName}
            onChange={(event) => setExpenseName(event.target.value)}
            placeholder="Nosaukums"
            aria-label="Izdevuma nosaukums"
            maxLength={120}
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-2 py-2 text-sm outline-none focus:border-blue-500 sm:px-3 dark:border-zinc-600"
          />
          <input
            type="number"
            value={expenseAmount}
            onChange={(event) => setExpenseAmount(event.target.value)}
            placeholder="Summa €"
            aria-label="Izdevuma summa"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            className="w-24 shrink-0 rounded-lg border border-zinc-300 bg-transparent px-2 py-2 text-sm outline-none focus:border-blue-500 sm:w-28 sm:px-3 dark:border-zinc-600"
          />
          <button
            type="submit"
            disabled={saving}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
            aria-label="Saglabāt izdevumu"
          >
            <Check size={21} strokeWidth={3} />
          </button>
        </form>

        {error && (
          <p className="border-t border-zinc-200 px-4 py-3 text-sm text-red-600 dark:border-zinc-700 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="border-t border-zinc-200 dark:border-zinc-700">
          {expenses.length === 0 ? (
            <p className="px-4 py-5 text-sm text-zinc-500">
              Šajā mēnesī izdevumu vēl nav.
            </p>
          ) : (
            expenses.map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3 last:border-b-0 dark:border-zinc-700"
              >
                <span className="break-words">{expense.name}</span>
                <div className="ml-auto flex shrink-0 items-center gap-3">
                  <span className="font-semibold">
                    {expense.amount.toLocaleString("lv-LV", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    €
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteExpense(expense)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700"
                    aria-label={`Dzēst izdevumu ${expense.name}`}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
