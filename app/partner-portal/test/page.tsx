"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, Plus, Trash2, X } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import UnifiedTransportRequestForm from "@/app/components/UnifiedTransportRequestForm";
import HatGlassesIcon from "@/app/components/HatGlassesIcon";
import type { PartnerPreset } from "@/app/request/[token]/RequestForm";
import { supabase } from "@/lib/supabaseClient";

type TestRequest = {
  id: number;
  created_at: string;
  payload: Record<string, unknown>;
};

type TestPortalData = {
  partner: PartnerPreset["partner"];
  contacts: PartnerPreset["contacts"];
  requests: TestRequest[];
};

const text = (value: unknown) => typeof value === "string" ? value : "";

function PartnerPortalTestContent() {
  const searchParams = useSearchParams();
  const partnerId = Number(searchParams.get("partnerId"));
  const [data, setData] = useState<TestPortalData | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const authorizedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return null;
    return fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
    });
  }, []);

  const load = useCallback(async () => {
    if (!Number.isSafeInteger(partnerId) || partnerId <= 0) {
      setError("Partneris nav norādīts.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const response = await authorizedFetch(`/api/admin/partner-portal/test-requests?partnerId=${partnerId}`);
    if (!response?.ok) {
      const result = response ? await response.json() : {};
      setError(result.error || "Testa portālu neizdevās ielādēt.");
      setLoading(false);
      return;
    }
    setData(await response.json() as TestPortalData);
    setError("");
    setLoading(false);
  }, [authorizedFetch, partnerId]);

  useEffect(() => { void load(); }, [load]);

  const partnerPreset = useMemo<PartnerPreset | null>(() => data ? {
    valid: true,
    partner: data.partner,
    contacts: data.contacts,
  } : null, [data]);

  async function deleteRequest(id: number) {
    if (!window.confirm("Vai dzēst šo testa pieteikumu?")) return;
    setDeletingId(id);
    const response = await authorizedFetch(`/api/admin/partner-portal/test-requests/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!response?.ok) {
      setError("Testa pieteikumu neizdevās dzēst.");
      return;
    }
    await load();
  }

  if (formOpen && partnerPreset) {
    return (
      <main className="min-h-screen bg-slate-100 p-3 text-slate-950 sm:p-6">
        <div className="mx-auto mb-4 flex max-w-6xl items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <span className="flex items-center gap-2 text-sm font-semibold"><HatGlassesIcon size={18} /> Testa portāls — partneris šo pieteikumu neredzēs</span>
          <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg p-2 hover:bg-amber-100" aria-label="Aizvērt testa formu"><X size={20} /></button>
        </div>
        <UnifiedTransportRequestForm mode="create" token="" initiallyValid partnerPreset={partnerPreset} testPartnerId={partnerId} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-3 text-slate-950 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-700"><HatGlassesIcon size={17} /> Izolēts administratora testa portāls</p>
              <h1 className="mt-1 text-2xl font-bold">{data?.partner.display_name || "Partneris"}</h1>
            </div>
            <div className="flex gap-2">
              <Link href="/partners" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 font-semibold"><ArrowLeft size={18} /> Partneri</Link>
              <button type="button" disabled={!data} onClick={() => setFormOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 font-semibold text-white disabled:opacity-50"><Plus size={18} /> Jauns testa pieteikums</button>
            </div>
          </div>
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Šeit izveidotie pieteikumi nenonāk Plānotajos uzdevumos, neizraisa paziņojumus un nav redzami partnerim.</p>
        </header>

        {loading && <p className="rounded-xl bg-white p-5">Ielādē...</p>}
        {error && <p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}

        {!loading && data && (
          <section className="space-y-3">
            <h2 className="text-xl font-bold">Mani testa pieteikumi</h2>
            {data.requests.length === 0 && <p className="rounded-xl bg-white p-5 text-slate-500">Testa pieteikumu vēl nav.</p>}
            {data.requests.map((request) => {
              const payload = request.payload;
              return (
                <article key={request.id} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-bold">{text(payload.cargo_type) || "Testa pieteikums"}</h3>
                      <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><CalendarDays size={16} /> {text(payload.pickup_date)} {text(payload.pickup_time)}</p>
                      <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><MapPin size={16} /> {text(payload.pickup_address)} → {text(payload.dropoff_address)}</p>
                      <p className="mt-2 text-xs text-slate-400">Izveidots {new Date(request.created_at).toLocaleString("lv-LV")}</p>
                    </div>
                    <button type="button" disabled={deletingId === request.id} onClick={() => void deleteRequest(request.id)} className="rounded-lg border border-red-200 p-2 text-red-600 disabled:opacity-50" aria-label="Dzēst testa pieteikumu"><Trash2 size={18} /></button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

export default function PartnerPortalTestPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-100 p-6 text-slate-950">Ielādē testa portālu...</main>}>
      <PartnerPortalTestContent />
    </Suspense>
  );
}
