"use client";

import dynamic from "next/dynamic";
import { Building2, Check, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddressField from "@/app/components/AddressField";
import { supabase } from "@/lib/supabaseClient";

const LocationPicker = dynamic(() => import("@/app/components/LocationPicker"), { ssr: false });

type PartnerType = "private" | "company";
type Point = { lat: number; lng: number };
type CompanySuggestion = { name: string; registrationNumber: string; address: string };
type Partner = {
  id: number; display_name: string; partner_type: PartnerType;
  first_name: string | null; last_name: string | null;
  company_name: string | null; registration_number: string | null;
  contact_name: string | null; address: string;
  latitude: number | null; longitude: number | null;
  phone: string; email: string | null;
};

const emptyForm = {
  display_name: "", partner_type: "company" as PartnerType,
  first_name: "", last_name: "", company_name: "", registration_number: "",
  contact_name: "", address: "", phone: "+371", email: "",
};

function identityName(form: typeof emptyForm) {
  return form.partner_type === "company"
    ? form.company_name.trim()
    : [form.first_name.trim(), form.last_name.trim()].filter(Boolean).join(" ");
}

export default function PartnersPage() {
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [point, setPoint] = useState<Point | null>(null);
  const [focusPoint, setFocusPoint] = useState<Point | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [companySuggestions, setCompanySuggestions] = useState<CompanySuggestion[]>([]);
  const [companySearchFocused, setCompanySearchFocused] = useState(false);
  const [companySearchLoading, setCompanySearchLoading] = useState(false);
  const selectedCompanyNameRef = useRef("");
  const reverseRequestRef = useRef(0);

  async function loadPartners() {
    const { data, error } = await supabase.from("partners")
      .select("id, display_name, partner_type, first_name, last_name, company_name, registration_number, contact_name, address, latitude, longitude, phone, email")
      .order("display_name");
    if (error) { setMessage("Partneru sarakstu neizdevās ielādēt."); return; }
    setPartners((data || []) as Partner[]);
  }

  useEffect(() => {
    async function load() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", authData.user.id).single();
      if (profile?.role !== "admin") { router.replace("/summary"); return; }
      await loadPartners();
      setLoading(false);
    }
    void load();
  }, [router]);

  useEffect(() => {
    const query = form.company_name.trim();
    if (form.partner_type !== "company" || !companySearchFocused || query.length < 2 || query === selectedCompanyNameRef.current) {
      setCompanySuggestions([]); setCompanySearchLoading(false); return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCompanySearchLoading(true);
      try {
        const response = await fetch(`/api/companies?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const result = (await response.json()) as { companies?: CompanySuggestion[] };
        setCompanySuggestions(response.ok ? result.companies || [] : []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setCompanySuggestions([]);
      } finally { if (!controller.signal.aborted) setCompanySearchLoading(false); }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [companySearchFocused, form.company_name, form.partner_type]);

  const updatePoint = useCallback(async (nextPoint: Point) => {
    const requestId = ++reverseRequestRef.current;
    setPoint(nextPoint); setFocusPoint(nextPoint);
    try {
      const response = await fetch(`/api/geocode?lat=${encodeURIComponent(nextPoint.lat)}&lng=${encodeURIComponent(nextPoint.lng)}`);
      const result = (await response.json()) as { result?: { label?: string } | null };
      const label = result.result?.label?.trim();
      if (response.ok && label && requestId === reverseRequestRef.current) setForm((current) => ({ ...current, address: label }));
    } catch { /* Koordinātes saglabājas arī bez atrastas adreses. */ }
  }, []);

  const filteredPartners = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("lv");
    if (!query) return partners;
    return partners.filter((partner) =>
      [partner.display_name, partner.company_name, partner.first_name, partner.last_name, partner.registration_number, partner.contact_name, partner.address, partner.phone, partner.email]
        .filter(Boolean).some((value) => String(value).toLocaleLowerCase("lv").includes(query)),
    );
  }, [partners, search]);

  function clearForm() {
    setEditingId(null); setForm(emptyForm); setPoint(null); setFocusPoint(null);
    setCompanySuggestions([]); setMessage("");
  }

  function editPartner(partner: Partner) {
    setEditingId(partner.id);
    setForm({
      display_name: partner.display_name, partner_type: partner.partner_type,
      first_name: partner.first_name || "", last_name: partner.last_name || "",
      company_name: partner.company_name || "", registration_number: partner.registration_number || "",
      contact_name: partner.contact_name || "", address: partner.address,
      phone: partner.phone, email: partner.email || "",
    });
    const savedPoint = partner.latitude !== null && partner.longitude !== null ? { lat: partner.latitude, lng: partner.longitude } : null;
    setPoint(savedPoint); setFocusPoint(savedPoint); setMessage("");
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function savePartner() {
    const displayName = form.display_name.trim() || identityName(form);
    const identityValid = form.partner_type === "company"
      ? form.company_name.trim() && form.registration_number.trim()
      : form.first_name.trim();
    const phone = form.phone.replace(/\s/g, "");
    if (!displayName || !identityValid || !form.contact_name.trim() || !form.address.trim() || !point || !/^\+[1-9]\d{7,14}$/.test(phone)) {
      setMessage("Aizpildi partnera nosaukumu, rekvizītus, kontaktpersonu, korektu tālruni un atzīmē lokāciju kartē.");
      return;
    }
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    setSaving(true); setMessage("");
    const values = {
      display_name: displayName, partner_type: form.partner_type,
      first_name: form.partner_type === "private" ? form.first_name.trim() : null,
      last_name: form.partner_type === "private" ? form.last_name.trim() || null : null,
      company_name: form.partner_type === "company" ? form.company_name.trim() : null,
      registration_number: form.partner_type === "company" ? form.registration_number.trim() : null,
      contact_name: form.contact_name.trim(), address: form.address.trim(),
      latitude: point.lat, longitude: point.lng, phone,
      email: form.email.trim() || null, created_by: authData.user.id,
      updated_at: new Date().toISOString(),
    };
    const { error } = editingId
      ? await supabase.from("partners").update(values).eq("id", editingId)
      : await supabase.from("partners").insert(values);
    setSaving(false);
    if (error) { setMessage("Partneri neizdevās saglabāt."); return; }
    const wasEditing = editingId !== null;
    clearForm(); await loadPartners();
    setMessage(wasEditing ? "Partnera izmaiņas saglabātas." : "Partneris pievienots.");
  }

  async function deletePartner(partner: Partner) {
    if (!window.confirm(`Vai tiešām dzēst partneri “${partner.display_name}”?`)) return;
    const { error } = await supabase.from("partners").delete().eq("id", partner.id);
    if (error) { setMessage("Partneri neizdevās dzēst."); return; }
    if (editingId === partner.id) clearForm();
    await loadPartners(); setMessage("Partneris izdzēsts.");
  }

  if (loading) return <p className="p-6">Ielādē...</p>;
  const inputClass = "w-full rounded-lg border border-zinc-300 bg-transparent p-2.5 dark:border-zinc-600";

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4">
      <div><h1 className="text-2xl font-bold">Partneri</h1><p className="mt-1 text-sm text-zinc-500">Pārvaldi klientus, kontaktus, rekvizītus un lokācijas.</p></div>
      {message && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">{message}</p>}

      <section className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">{editingId ? "Rediģēt partneri" : "Pievienot partneri"}</h2>
          {editingId && <button type="button" onClick={clearForm} className="flex items-center gap-1 text-sm text-zinc-500"><X size={17} /> Atcelt</button>}
        </div>
        <label className="block space-y-1 text-sm"><span className="font-medium">Partnera nosaukums</span><input value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} placeholder="Ja atstāj tukšu, izmantos uzņēmuma nosaukumu vai vārdu" className={inputClass} /></label>

        <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <h3 className="mb-3 font-semibold">Partnera rekvizīti</h3>
          <div className="mb-3 flex gap-4">
            <label className="flex items-center gap-2"><input type="radio" checked={form.partner_type === "company"} onChange={() => setForm((current) => ({ ...current, partner_type: "company" }))} /> Uzņēmums</label>
            <label className="flex items-center gap-2"><input type="radio" checked={form.partner_type === "private"} onChange={() => setForm((current) => ({ ...current, partner_type: "private" }))} /> Privātpersona</label>
          </div>
          {form.partner_type === "company" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setCompanySearchFocused(false); setCompanySuggestions([]); } }}>
                <label className="space-y-1 text-sm"><span className="font-medium">Uzņēmuma nosaukums *</span><input value={form.company_name} onFocus={() => setCompanySearchFocused(true)} onChange={(event) => { selectedCompanyNameRef.current = ""; setForm((current) => ({ ...current, company_name: event.target.value, registration_number: "" })); }} autoComplete="off" className={inputClass} /></label>
                {companySearchLoading && <span className="mt-1 block text-xs text-zinc-500">Meklē uzņēmumu...</span>}
                {companySuggestions.length > 0 && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                  {companySuggestions.map((company) => <button key={`${company.registrationNumber}-${company.name}`} type="button" onClick={() => { selectedCompanyNameRef.current = company.name.trim(); setCompanySearchFocused(false); setCompanySuggestions([]); setForm((current) => ({ ...current, company_name: company.name, registration_number: company.registrationNumber, address: company.address || current.address, display_name: current.display_name || company.name })); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-zinc-800"><strong className="block">{company.name}</strong><span className="block text-xs text-zinc-500">Reģ. Nr. {company.registrationNumber}{company.address ? ` · ${company.address}` : ""}</span></button>)}
                </div>}
              </div>
              <label className="space-y-1 text-sm"><span className="font-medium">Reģistrācijas/PVN numurs *</span><input value={form.registration_number} onChange={(event) => setForm((current) => ({ ...current, registration_number: event.target.value }))} className={inputClass} /></label>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm"><span className="font-medium">Vārds *</span><input value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} className={inputClass} /></label>
              <label className="space-y-1 text-sm"><span className="font-medium">Uzvārds</span><input value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} className={inputClass} /></label>
            </div>
          )}
        </div>

        <div className="grid gap-3 border-t border-zinc-200 pt-4 sm:grid-cols-2 dark:border-zinc-700">
          <label className="space-y-1 text-sm"><span className="font-medium">Kontaktpersona *</span><input value={form.contact_name} onChange={(event) => setForm((current) => ({ ...current, contact_name: event.target.value }))} className={inputClass} /></label>
          <label className="space-y-1 text-sm"><span className="font-medium">Tālrunis *</span><input type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+37120123456" className={inputClass} /></label>
          <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium">E-pasts</span><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className={inputClass} /></label>
        </div>

        <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <h3 className="font-semibold">Lokācija</h3>
          <AddressField id="partner-address" value={form.address} onChange={(address) => setForm((current) => ({ ...current, address }))} onMapFocus={(nextPoint) => { setPoint(nextPoint); setFocusPoint(nextPoint); }} onLocationImport={updatePoint} />
          <LocationPicker point={point} focusPoint={focusPoint} onChange={updatePoint} />
        </div>

        <button type="button" onClick={() => void savePartner()} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50 sm:w-auto">{editingId ? <Check size={18} /> : <Plus size={18} />}{saving ? "Saglabā..." : "Saglabāt"}</button>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><h2 className="font-semibold">Partneri ({partners.length})</h2><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Meklēt partneri" className={`${inputClass} sm:max-w-xs`} /></div>
        {filteredPartners.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">Partneri nav atrasti.</p> : filteredPartners.map((partner) => (
          <article key={partner.id} className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
            <div className="flex min-w-0 gap-3"><div className="mt-0.5 rounded-lg bg-blue-50 p-2 text-blue-700 dark:bg-blue-950 dark:text-blue-300">{partner.partner_type === "company" ? <Building2 size={20} /> : <UserRound size={20} />}</div><div className="min-w-0"><h3 className="font-semibold">{partner.display_name}</h3>{partner.company_name && partner.company_name !== partner.display_name && <p className="text-sm text-zinc-500">{partner.company_name}</p>}{partner.registration_number && <p className="text-sm text-zinc-500">Reģ./PVN: {partner.registration_number}</p>}{partner.contact_name && <p className="text-sm text-zinc-500">Kontaktpersona: {partner.contact_name}</p>}<p className="text-sm text-zinc-500">{partner.address}</p><p className="text-sm text-zinc-500">{partner.phone}{partner.email ? ` · ${partner.email}` : ""}</p></div></div>
            <div className="flex shrink-0 gap-2"><button type="button" onClick={() => editPartner(partner)} className="rounded-lg border border-zinc-300 p-2 dark:border-zinc-600" aria-label="Rediģēt partneri"><Pencil size={18} /></button><button type="button" onClick={() => void deletePartner(partner)} className="rounded-lg border border-red-300 p-2 text-red-600 dark:border-red-800" aria-label="Dzēst partneri"><Trash2 size={18} /></button></div>
          </article>
        ))}
      </section>
    </div>
  );
}
