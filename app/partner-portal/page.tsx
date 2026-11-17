"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, House, Laptop, MapPin, Menu, Moon, Pencil, Plus, Power, Repeat2, Search, Sun, Trash2, TriangleAlert, Truck, UserRound, X } from "lucide-react";
import UnifiedTransportRequestForm from "@/app/components/UnifiedTransportRequestForm";
import PartnerProfileForm, { type PortalPartner } from "@/app/partner-portal/PartnerProfileForm";
import PartnerNotificationSettings from "@/app/partner-portal/PartnerNotificationSettings";
import { supabase } from "@/lib/supabaseClient";
import { APP_VERSION } from "@/lib/appVersion";
import { shortAddress } from "@/lib/addressDisplay";

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
      pickup_date?: string;
      pickup_time?: string;
      pickup_address?: string;
      dropoff_address?: string;
    };
    customCargo?: string;
  };
};

type OverviewFilter = Exclude<PlannedTask["status"], "canceled"> | "draft" | null;
type DateScope = "month" | "today" | "tomorrow" | "week" | "date";
type SortMode = "newest" | "nearest";

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

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateRange(scope: DateScope, month: string, selectedDate: string) {
  const today = new Date();
  if (scope === "month") {
    const [year, monthIndex] = month.split("-").map(Number);
    const lastDay = new Date(year, monthIndex, 0).getDate();
    return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
  }
  if (scope === "today") {
    const value = localDateValue(today);
    return { from: value, to: value };
  }
  if (scope === "tomorrow") {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const value = localDateValue(tomorrow);
    return { from: value, to: value };
  }
  if (scope === "week") {
    const monday = new Date(today);
    const weekday = monday.getDay() || 7;
    monday.setDate(monday.getDate() - weekday + 1);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return { from: localDateValue(monday), to: localDateValue(sunday) };
  }
  const value = selectedDate || localDateValue(today);
  return { from: value, to: value };
}

export default function PartnerPortalPage() {
  const router = useRouter();
  const [partnerName, setPartnerName] = useState("");
  const [partner, setPartner] = useState<PortalPartner | null>(null);
  const [newRequestUrl, setNewRequestUrl] = useState("");
  const [items, setItems] = useState<PartnerRequest[]>([]);
  const [overviewItems, setOverviewItems] = useState<PartnerRequest[]>([]);
  const [drafts, setDrafts] = useState<PartnerDraft[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openRequestId, setOpenRequestId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [viewingProfile, setViewingProfile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [overviewFilter, setOverviewFilter] = useState<OverviewFilter>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateScope, setDateScope] = useState<DateScope>("month");
  const [selectedDate, setSelectedDate] = useState(() => localDateValue(new Date()));
  const [sortMode, setSortMode] = useState<SortMode>("newest");

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
      setViewingProfile(true);
      setEditingProfile(true);
      setItems([]);
      setLoading(false);
      return;
    }
    const range = dateRange(dateScope, month, selectedDate);
    const monthUrl = `/api/partner-portal/requests?month=${encodeURIComponent(month)}`;
    const listUrl = dateScope === "month"
      ? monthUrl
      : `/api/partner-portal/requests?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
    const [requestResponse, overviewResponse] = await Promise.all([
      authorizedFetch(listUrl),
      dateScope === "month" ? Promise.resolve(null) : authorizedFetch(monthUrl),
    ]);
    if (!requestResponse?.ok || (overviewResponse && !overviewResponse.ok)) {
      setLoading(false);
      setError("Partnera pieteikumus neizdevās ielādēt.");
      return;
    }
    const requests = await requestResponse.json();
    const loadedItems = (requests.requests || []) as PartnerRequest[];
    setItems(loadedItems);
    if (overviewResponse) {
      const overviewRequests = await overviewResponse.json();
      setOverviewItems((overviewRequests.requests || []) as PartnerRequest[]);
    } else {
      setOverviewItems(loadedItems);
    }
    const draftsResponse = await authorizedFetch("/api/partner-portal/drafts");
    if (draftsResponse?.ok) {
      const draftResult = await draftsResponse.json();
      setDrafts((draftResult.drafts || []) as PartnerDraft[]);
    }
    setLoading(false);
  }, [authorizedFetch, dateScope, month, router, selectedDate]);

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

  const counts = useMemo(() => overviewItems.reduce<Record<string, number>>((result, item) => {
    const status = linkedTask(item)?.status || "new";
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {}), [overviewItems]);

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase("lv");

  const filteredItems = useMemo(() => {
    const statusFiltered = !overviewFilter
      ? items
      : overviewFilter === "draft"
        ? []
        : items.filter((item) => (linkedTask(item)?.status || "new") === overviewFilter);
    const searched = !normalizedSearch ? statusFiltered : statusFiltered.filter((item) => {
      const status = linkedTask(item)?.status || "new";
      return [item.cargo_type, item.pickup_address, item.dropoff_address, item.pickup_date, item.pickup_time, statusLabels[status]]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("lv").includes(normalizedSearch));
    });
    return [...searched].sort((left, right) => {
      if (sortMode === "newest") return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      const leftMoment = `${left.pickup_date}T${left.pickup_time?.slice(0, 5) || "23:59"}`;
      const rightMoment = `${right.pickup_date}T${right.pickup_time?.slice(0, 5) || "23:59"}`;
      return leftMoment.localeCompare(rightMoment);
    });
  }, [items, normalizedSearch, overviewFilter, sortMode]);

  const filteredDrafts = useMemo(() => {
    if (overviewFilter && overviewFilter !== "draft") return [];
    const range = dateRange(dateScope, month, selectedDate);
    const dateFiltered = drafts.filter((draft) => {
      const pickupDate = draft.payload?.form?.pickup_date || "";
      return !pickupDate || (pickupDate >= range.from && pickupDate <= range.to);
    });
    const searched = !normalizedSearch ? dateFiltered : dateFiltered.filter((draft) => {
      const form = draft.payload?.form || {};
      const cargo = form.cargo_type === "Cits" ? draft.payload.customCargo : form.cargo_type;
      return [cargo, form.pickup_address, form.dropoff_address, "Melnraksts"]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("lv").includes(normalizedSearch));
    });
    return [...searched].sort((left, right) => {
      if (sortMode === "newest") return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
      const leftForm = left.payload?.form || {};
      const rightForm = right.payload?.form || {};
      return `${leftForm.pickup_date || "9999-12-31"}T${leftForm.pickup_time || "23:59"}`.localeCompare(`${rightForm.pickup_date || "9999-12-31"}T${rightForm.pickup_time || "23:59"}`);
    });
  }, [dateScope, drafts, month, normalizedSearch, overviewFilter, selectedDate, sortMode]);

  function selectOverviewFilter(filter: Exclude<OverviewFilter, null>) {
    setOverviewFilter((current) => current === filter ? null : filter);
    window.setTimeout(() => document.getElementById("partner-requests")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

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
          <button type="button" onClick={() => { setViewingProfile(false); setEditingProfile(false); setSidebarOpen(false); }} className="flex items-center gap-2 text-left text-base font-medium hover:text-blue-600"><House size={19} /> Sākums</button>
          <button type="button" onClick={() => { setViewingProfile(true); setEditingProfile(false); setSidebarOpen(false); }} className="flex items-center gap-2 text-left text-base font-medium hover:text-blue-600"><UserRound size={19} /> Profils</button>
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
      {!loading && !viewingProfile && partner?.profile_completed && newRequestUrl && (
        <div className="mx-auto mb-5 flex max-w-5xl justify-center">
          <a href={newRequestUrl} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-3 font-semibold text-white shadow-sm">
            <Plus size={20} /> Jauns Brauciens
          </a>
        </div>
      )}
      {!loading && partner && !partner.profile_completed ? (
        <PartnerProfileForm partner={partner} authorizedFetch={authorizedFetch} onSaved={async () => { setEditingProfile(false); setViewingProfile(true); await load(); }} />
      ) : !loading && partner && viewingProfile ? (
        <div className="mx-auto max-w-3xl space-y-5">
          <section className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-zinc-800">
            <button
              type="button"
              onClick={() => setEditingProfile((current) => !current)}
              aria-expanded={editingProfile}
              className="flex w-full items-center justify-between gap-3 p-5 text-left"
            >
              <div className="flex min-w-0 items-center gap-3">
                {partner.logo_url ? <img src={partner.logo_url} alt="Partnera logo" className="h-12 w-12 shrink-0 rounded-xl bg-white object-contain p-1" /> : <UserRound size={30} className="shrink-0 text-blue-600" />}
                <div className="min-w-0"><h2 className="truncate font-bold">Partnera kartīte</h2><p className="truncate text-sm text-slate-500">{partner.display_name}</p></div>
              </div>
              <ChevronDown className={`shrink-0 transition-transform ${editingProfile ? "rotate-180" : ""}`} size={22} />
            </button>
          </section>
          {editingProfile && <PartnerProfileForm partner={partner} authorizedFetch={authorizedFetch} onSaved={async () => { setEditingProfile(false); await load(); }} onCancel={() => setEditingProfile(false)} />}
          <PartnerNotificationSettings authorizedFetch={authorizedFetch} />
        </div>
      ) : (
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-800">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Mēneša pārskats</h2>
              <p className="text-sm text-slate-500">Šajā mēnesī: {overviewItems.length} pieteikumi</p>
            </div>
            <label className="text-sm font-medium">Mēnesis
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900" />
            </label>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(["new", "planned", "started", "completed"] as PlannedTask["status"][]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => selectOverviewFilter(status as Exclude<OverviewFilter, null>)}
                aria-pressed={overviewFilter === status}
                className={`rounded-xl p-3 text-left transition hover:ring-2 hover:ring-blue-400 ${overviewFilter === status ? "bg-blue-600 text-white ring-2 ring-blue-300" : "bg-slate-50 dark:bg-zinc-900"}`}
              >
                <p className={`text-xs ${overviewFilter === status ? "text-blue-100" : "text-slate-500"}`}>{statusLabels[status]}</p>
                <p className="text-2xl font-bold">{counts[status] || 0}</p>
              </button>
            ))}
            <button
              type="button"
              onClick={() => selectOverviewFilter("draft")}
              aria-pressed={overviewFilter === "draft"}
              className={`rounded-xl p-3 text-left transition hover:ring-2 hover:ring-blue-400 ${overviewFilter === "draft" ? "bg-blue-600 text-white ring-2 ring-blue-300" : "bg-slate-50 dark:bg-zinc-900"}`}
            >
              <p className={`text-xs ${overviewFilter === "draft" ? "text-blue-100" : "text-slate-500"}`}>Melnraksti</p>
              <p className="text-2xl font-bold">{drafts.length}</p>
            </button>
          </div>
        </section>

        <section id="partner-requests" className="scroll-mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">{overviewFilter ? overviewFilter === "draft" ? "Melnraksti" : statusLabels[overviewFilter] : "Mani pieteikumi"}</h2>
            <div className="flex items-center gap-2">
              {overviewFilter && <button type="button" onClick={() => setOverviewFilter(null)} className="text-sm font-semibold text-blue-600 hover:underline">Rādīt visus</button>}
              <button
                type="button"
                onClick={() => {
                  setSearchOpen((current) => !current);
                  if (searchOpen) setSearchQuery("");
                }}
                className={`rounded-lg p-2 ${searchOpen ? "bg-blue-600 text-white" : "hover:bg-slate-200 dark:hover:bg-zinc-700"}`}
                aria-label={searchOpen ? "Aizvērt meklēšanu" : "Meklēt pieteikumos"}
                title={searchOpen ? "Aizvērt meklēšanu" : "Meklēt"}
              >
                {searchOpen ? <X size={20} /> : <Search size={20} />}
              </button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Rādīt
              <select
                value={dateScope}
                onChange={(event) => setDateScope(event.target.value as DateScope)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-zinc-600 dark:bg-zinc-800"
              >
                <option value="month">Izvēlētais mēnesis</option>
                <option value="today">Šodien</option>
                <option value="tomorrow">Rīt</option>
                <option value="week">Šonedēļ</option>
                <option value="date">Konkrēts datums</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Kārtot
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-zinc-600 dark:bg-zinc-800"
              >
                <option value="newest">Pēc jaunākā pieteikuma</option>
                <option value="nearest">Pēc tuvākā izpildes laika</option>
              </select>
            </label>
          </div>
          {dateScope === "date" && (
            <label className="block text-sm font-medium">
              Datums
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-zinc-600 dark:bg-zinc-800 sm:max-w-xs"
              />
            </label>
          )}
          {searchOpen && (
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Meklēt pieteikumos..."
                className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-zinc-600 dark:bg-zinc-800"
              />
            </div>
          )}
          {error && <p className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
          {loading && <p className="rounded-xl bg-white p-5 dark:bg-zinc-800">Ielādē...</p>}
          {!loading && filteredItems.length === 0 && filteredDrafts.length === 0 && <p className="rounded-xl bg-white p-5 text-slate-500 dark:bg-zinc-800">{normalizedSearch ? "Nekas netika atrasts." : "Šajā sadaļā pieteikumu nav."}</p>}
          {filteredDrafts.map((draft) => {
            const draftForm = draft.payload?.form || {};
            const cargo = draftForm.cargo_type === "Cits" ? draft.payload.customCargo : draftForm.cargo_type;
            return (
              <article key={`draft-${draft.id}`} className="rounded-2xl border border-dashed border-amber-400 bg-white p-4 shadow-sm dark:bg-zinc-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{cargo || "Nepabeigts pieteikums"}</h3>
                    {(draftForm.pickup_address || draftForm.dropoff_address) && <p className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-zinc-300"><MapPin size={16} /> {shortAddress(draftForm.pickup_address) || "—"} → {shortAddress(draftForm.dropoff_address) || "—"}</p>}
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
          {filteredItems.map((item) => {
            const task = linkedTask(item);
            const status = task?.status || "new";
            const editable = status === "new" || status === "planned";
            const deletable = status === "new" || status === "planned";
            return (
              <article key={item.id} className="rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{item.cargo_type}</h3>
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-zinc-300"><CalendarDays size={16} /> {item.pickup_date}{item.pickup_time ? ` ${item.pickup_time.slice(0, 5)}` : ""}</p>
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-zinc-300"><MapPin size={16} /> {shortAddress(item.pickup_address)} → {shortAddress(item.dropoff_address)}</p>
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
                  {deletable && (
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
          mode={["new", "planned"].includes(linkedTask(items.find((item) => item.id === openRequestId)!)?.status || "") ? "edit" : "readonly"}
          requestId={openRequestId}
          onClose={() => setOpenRequestId(null)}
          onSaved={() => void load()}
        />
      )}
      </div>
    </main>
  );
}
