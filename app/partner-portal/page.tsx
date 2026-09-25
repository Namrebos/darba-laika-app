"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, LogOut, MapPin, Pencil, Plus, Trash2, Truck } from "lucide-react";
import UnifiedTransportRequestForm from "@/app/components/UnifiedTransportRequestForm";
import { supabase } from "@/lib/supabaseClient";

type PlannedTask = {
  id: number;
  status: "new" | "planned" | "started" | "completed" | "canceled";
  scheduled_date: string | null;
  scheduled_time: string | null;
};

type PartnerRequest = {
  id: number;
  created_at: string;
  pickup_date: string;
  pickup_time: string | null;
  pickup_address: string;
  dropoff_date: string;
  dropoff_address: string;
  cargo_type: string;
  planned_tasks: PlannedTask[] | PlannedTask | null;
};

const statusLabels: Record<PlannedTask["status"], string> = {
  new: "Nosūtīts",
  planned: "Plānots",
  started: "Sākts",
  completed: "Pabeigts",
  canceled: "Atcelts",
};

const statusStyles: Record<PlannedTask["status"], string> = {
  new: "bg-amber-100 text-amber-800",
  planned: "bg-blue-100 text-blue-800",
  started: "bg-violet-100 text-violet-800",
  completed: "bg-green-100 text-green-800",
  canceled: "bg-slate-200 text-slate-700",
};

function linkedTask(item: PartnerRequest) {
  return Array.isArray(item.planned_tasks) ? item.planned_tasks[0] : item.planned_tasks;
}

export default function PartnerPortalPage() {
  const router = useRouter();
  const [partnerName, setPartnerName] = useState("");
  const [newRequestUrl, setNewRequestUrl] = useState("");
  const [items, setItems] = useState<PartnerRequest[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openRequestId, setOpenRequestId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const authorizedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace("/partner-portal/login");
      return null;
    }
    return fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${data.session.access_token}`,
      },
    });
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [sessionResponse, requestResponse] = await Promise.all([
      authorizedFetch("/api/partner-portal/session"),
      authorizedFetch(`/api/partner-portal/requests?month=${encodeURIComponent(month)}`),
    ]);
    if (!sessionResponse || !requestResponse) return;
    if (!sessionResponse.ok || !requestResponse.ok) {
      setLoading(false);
      if (sessionResponse.status === 403) router.replace("/partner-portal/login");
      else setError("Partnera portālu neizdevās ielādēt.");
      return;
    }
    const session = await sessionResponse.json();
    const requests = await requestResponse.json();
    setPartnerName(session.partner?.display_name || "Partneris");
    setNewRequestUrl(session.newRequestUrl || "");
    setItems((requests.requests || []) as PartnerRequest[]);
    setLoading(false);
  }, [authorizedFetch, month, router]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => items.reduce<Record<string, number>>((result, item) => {
    const status = linkedTask(item)?.status || "new";
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {}), [items]);

  async function deleteRequest(id: number) {
    if (!window.confirm("Vai tiešām dzēst šo pieteikumu?")) return;
    setDeletingId(id);
    const response = await authorizedFetch(`/api/partner-portal/requests/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!response?.ok) {
      const result = response ? await response.json() : {};
      setError(result.error || "Pieteikumu neizdevās izdzēst.");
      return;
    }
    await load();
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/partner-portal/login");
  }

  return (
    <main className="min-h-screen w-full bg-slate-100 p-3 text-slate-950 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5 shadow-sm">
          <div>
            <p className="text-sm text-slate-500">Partnera portāls</p>
            <h1 className="text-2xl font-bold">{partnerName || "Ielādē..."}</h1>
          </div>
          <div className="flex items-center gap-2">
            {newRequestUrl && (
              <a href={newRequestUrl} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 font-semibold text-white">
                <Plus size={19} /> Jauns pieteikums
              </a>
            )}
            <button type="button" onClick={() => void logout()} className="rounded-xl border border-slate-300 p-2.5" aria-label="Iziet">
              <LogOut size={19} />
            </button>
          </div>
        </header>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Mēneša pārskats</h2>
              <p className="text-sm text-slate-500">Šajā mēnesī: {items.length} pieteikumi</p>
            </div>
            <label className="text-sm font-medium">Mēnesis
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="ml-2 rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(Object.keys(statusLabels) as PlannedTask["status"][]).map((status) => (
              <div key={status} className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">{statusLabels[status]}</p>
                <p className="text-2xl font-bold">{counts[status] || 0}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Mani pieteikumi</h2>
          {error && <p className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
          {loading && <p className="rounded-xl bg-white p-5">Ielādē...</p>}
          {!loading && items.length === 0 && <p className="rounded-xl bg-white p-5 text-slate-500">Šajā mēnesī pieteikumu nav.</p>}
          {items.map((item) => {
            const task = linkedTask(item);
            const status = task?.status || "new";
            const editable = status === "new";
            return (
              <article key={item.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{item.cargo_type}</h3>
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><CalendarDays size={16} /> {item.pickup_date}{item.pickup_time ? ` ${item.pickup_time.slice(0, 5)}` : ""}</p>
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><MapPin size={16} /> {item.pickup_address} → {item.dropoff_address}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[status]}`}>{statusLabels[status]}</span>
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button type="button" onClick={() => setOpenRequestId(item.id)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
                    {editable ? <Pencil size={16} /> : <Truck size={16} />} {editable ? "Labot" : "Apskatīt"}
                  </button>
                  {editable && (
                    <button type="button" disabled={deletingId === item.id} onClick={() => void deleteRequest(item.id)} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">
                      <Trash2 size={16} /> Dzēst
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      </div>

      {openRequestId && (
        <UnifiedTransportRequestForm
          mode={linkedTask(items.find((item) => item.id === openRequestId)!)?.status === "new" ? "edit" : "readonly"}
          requestId={openRequestId}
          onClose={() => setOpenRequestId(null)}
          onSaved={() => void load()}
        />
      )}
    </main>
  );
}
