"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Laptop, MapPin, Menu, Moon, Pencil, Plus, Power, Repeat2, Sun, Trash2, TriangleAlert, Truck, UserRound, X } from "lucide-react";
import UnifiedTransportRequestForm from "@/app/components/UnifiedTransportRequestForm";
import PartnerProfileForm, { type PortalPartner } from "@/app/partner-portal/PartnerProfileForm";
import { supabase } from "@/lib/supabaseClient";
import { APP_VERSION } from "@/lib/appVersion";

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

type PartnerDraft = {
  id: number;
  created_at: string;
  updated_at: string;
  payload: {
    form?: {
      cargo_type?: string;
      pickup_address?: string;
      dropoff_address?: string;
    };
    customCargo?: string;
  };
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
  const [partner, setPartner] = useState<PortalPartner | null>(null);
  const [newRequestUrl, setNewRequestUrl] = useState("");
  const [items, setItems] = useState<PartnerRequest[]>([]);
  const [drafts, setDrafts] = useState<PartnerDraft[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openRequestId, setOpenRequestId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [updateAvailable, setUpdateAvailable] = useState(false);

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
    const sessionResponse = await authorizedFetch("/api/partner-portal/session");
    if (!sessionResponse) return;
    if (!sessionResponse.ok) {
      setLoading(false);
      if (sessionResponse.status === 403) router.replace("/partner-portal/login");
      else setError("Partnera portālu neizdevās ielādēt.");
      return;
    }
    const session = await sessionResponse.json();
    const loadedPartner = session.partner as PortalPartner | null;
    setPartner(loadedPartner);
    setPartnerName(loadedPartner?.display_name || "Partneris");
    setNewRequestUrl(session.newRequestUrl || "");
    if (!loadedPartner?.profile_completed) {
      setEditingProfile(true);
      setItems([]);
      setLoading(false);
      return;
    }
    const requestResponse = await authorizedFetch(`/api/partner-portal/requests?month=${encodeURIComponent(month)}`);
    if (!requestResponse?.ok) {
      setLoading(false);
      setError("Partnera pieteikumus neizdevās ielādēt.");
      return;
    }
    const requests = await requestResponse.json();
    setItems((requests.requests || []) as PartnerRequest[]);
    const draftsResponse = await authorizedFetch("/api/partner-portal/drafts");
    if (draftsResponse?.ok) {
      const draftResult = await draftsResponse.json();
      setDrafts((draftResult.drafts || []) as PartnerDraft[]);
    }
    setLoading(false);
  }, [authorizedFetch, month, router]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | "system" | null;
    setTheme(savedTheme || "system");
    const handleUpdateStatus = (event: Event) => {
      setUpdateAvailable((event as CustomEvent<{ updateAvailable?: boolean }>).detail?.updateAvailable === true);
    };
    window.addEventListener("app-update-status", handleUpdateStatus);
    return () => window.removeEventListener("app-update-status", handleUpdateStatus);
  }, []);

  function changeTheme(mode: "light" | "dark" | "system") {
    setTheme(mode);
    localStorage.setItem("theme", mode);
    const useDark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", useDark);
  }

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

  async function deleteDraft(id: number) {
    if (!window.confirm("Vai tiešām dzēst šo melnrakstu?")) return;
    const response = await authorizedFetch(`/api/partner-portal/drafts/${id}`, { method: "DELETE" });
    if (!response?.ok) {
      setError("Melnrakstu neizdevās dzēst.");
      return;
    }
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/partner-portal/login");
  }

  return (
    <main className="min-h-screen w-full bg-slate-100 text-slate-950 transition-colors dark:bg-zinc-900 dark:text-white">
      <div className={`fixed inset-0 z-40 bg-black/50 ${sidebarOpen ? "block" : "hidden"}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`fixed left-0 top-0 z-50 flex h-full w-64 transform flex-col bg-white shadow-xl transition-transform dark:bg-zinc-800 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between border-b border-zinc-300 p-4 dark:border-zinc-700">
          <h2 className="text-lg font-bold">Izvēlne</h2>
          <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Aizvērt izvēlni"><X size={24} /></button>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <button type="button" onClick={() => { setEditingProfile(true); setSidebarOpen(false); }} className="flex items-center gap-2 text-left text-base font-medium hover:text-blue-600"><UserRound size={19} /> Profils</button>
          <div className="mt-auto space-y-4 border-t border-zinc-300 pt-4 dark:border-zinc-700">
            <div>
              <p className="mb-2 text-sm font-semibold">Režīms:</p>
              <div className="flex gap-2">
                {([
                  ["light", "Gaišais režīms", <Sun key="sun" size={18} />],
                  ["dark", "Tumšais režīms", <Moon key="moon" size={18} />],
                  ["system", "Sistēmas režīms", <Laptop key="laptop" size={18} />],
                ] as const).map(([mode, label, icon]) => <button key={mode} type="button" onClick={() => changeTheme(mode)} className={`rounded p-2 ${theme === mode ? "bg-blue-600 text-white" : "bg-zinc-200 text-black dark:bg-zinc-700 dark:text-white"}`} title={label}>{icon}</button>)}
              </div>
            </div>
            <div className="space-y-2 border-t border-zinc-300 pt-4 dark:border-zinc-700">
              <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">Versija: {APP_VERSION}{updateAvailable && <TriangleAlert size={15} className="fill-yellow-400 text-yellow-700" />}</p>
              <button type="button" onClick={() => window.dispatchEvent(new Event("app-check-for-updates"))} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700">Pārbaudīt atjauninājumus</button>
            </div>
            <button type="button" onClick={() => void logout()} className="flex w-full items-center justify-center rounded bg-red-600 py-2 text-white hover:bg-red-700" title="Izrakstīties"><Power size={20} /></button>
          </div>
        </nav>
      </aside>

      <header className="border-b border-zinc-300 bg-white px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="relative mx-auto flex max-w-5xl items-center justify-between">
          <button type="button" onClick={() => setSidebarOpen(true)} className="text-zinc-800 dark:text-white" aria-label="Atvērt izvēlni"><Menu size={28} /></button>
          <div className="absolute left-1/2 flex max-w-[70%] -translate-x-1/2 items-center gap-2">
            {partner?.logo_url && <img src={partner.logo_url} alt={`${partner.display_name} logo`} className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain p-1" />}
            <strong className="truncate text-center text-lg sm:text-xl">{partnerName || "Partnera portāls"}</strong>
          </div>
          <div className="w-7" />
        </div>
      </header>

      <div className="p-3 sm:p-6">
      {!loading && partner?.profile_completed && newRequestUrl && (
        <div className="mx-auto mb-5 flex max-w-5xl justify-center">
          <a href={newRequestUrl} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-3 font-semibold text-white shadow-sm">
            <Plus size={20} /> Jauns Brauciens
          </a>
        </div>
      )}
      {!loading && partner && (!partner.profile_completed || editingProfile) ? (
        <PartnerProfileForm partner={partner} authorizedFetch={authorizedFetch} onSaved={async () => { setEditingProfile(false); await load(); }} onCancel={partner.profile_completed ? () => setEditingProfile(false) : undefined} />
      ) : (
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-800">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Mēneša pārskats</h2>
              <p className="text-sm text-slate-500">Šajā mēnesī: {items.length} pieteikumi</p>
            </div>
            <label className="text-sm font-medium">Mēnesis
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900" />
            </label>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(Object.keys(statusLabels) as PlannedTask["status"][]).map((status) => (
              <div key={status} className="rounded-xl bg-slate-50 p-3 dark:bg-zinc-900">
                <p className="text-xs text-slate-500">{statusLabels[status]}</p>
                <p className="text-2xl font-bold">{counts[status] || 0}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Mani pieteikumi</h2>
          {error && <p className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
          {loading && <p className="rounded-xl bg-white p-5 dark:bg-zinc-800">Ielādē...</p>}
          {!loading && items.length === 0 && drafts.length === 0 && <p className="rounded-xl bg-white p-5 text-slate-500 dark:bg-zinc-800">Šajā mēnesī pieteikumu nav.</p>}
          {drafts.map((draft) => {
            const draftForm = draft.payload?.form || {};
            const cargo = draftForm.cargo_type === "Cits" ? draft.payload.customCargo : draftForm.cargo_type;
            return (
              <article key={`draft-${draft.id}`} className="rounded-2xl border border-dashed border-amber-400 bg-white p-4 shadow-sm dark:bg-zinc-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{cargo || "Nepabeigts pieteikums"}</h3>
                    {(draftForm.pickup_address || draftForm.dropoff_address) && <p className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-zinc-300"><MapPin size={16} /> {draftForm.pickup_address || "—"} → {draftForm.dropoff_address || "—"}</p>}
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Melnraksts</span>
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <a href={`${newRequestUrl}?draft=${draft.id}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"><Pencil size={16} /> Turpināt</a>
                  <button type="button" onClick={() => void deleteDraft(draft.id)} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700"><Trash2 size={16} /> Dzēst</button>
                </div>
              </article>
            );
          })}
          {items.map((item) => {
            const task = linkedTask(item);
            const status = task?.status || "new";
            const editable = status === "new";
            return (
              <article key={item.id} className="rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{item.cargo_type}</h3>
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-zinc-300"><CalendarDays size={16} /> {item.pickup_date}{item.pickup_time ? ` ${item.pickup_time.slice(0, 5)}` : ""}</p>
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-zinc-300"><MapPin size={16} /> {item.pickup_address} → {item.dropoff_address}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[status]}`}>{statusLabels[status]}</span>
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
                  {status === "completed" && newRequestUrl && (
                    <a href={`${newRequestUrl}?repeat=${item.id}`} className="inline-flex items-center gap-2 rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700">
                      <Repeat2 size={16} /> Atkārtot reversā
                    </a>
                  )}
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
      )}

      {partner?.profile_completed && openRequestId && (
        <UnifiedTransportRequestForm
          mode={linkedTask(items.find((item) => item.id === openRequestId)!)?.status === "new" ? "edit" : "readonly"}
          requestId={openRequestId}
          onClose={() => setOpenRequestId(null)}
          onSaved={() => void load()}
        />
      )}
      </div>
    </main>
  );
}
