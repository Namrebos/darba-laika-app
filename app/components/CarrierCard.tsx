"use client";

import dynamic from "next/dynamic";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import AddressField from "@/app/components/AddressField";
import { supabase } from "@/lib/supabaseClient";

const LocationPicker = dynamic(() => import("@/app/components/LocationPicker"), { ssr: false });
type Point = { lat: number; lng: number };
type Contact = { name: string; phone: string };
type Company = { name: string; registrationNumber: string; address: string };
const inputClass = "w-full rounded-lg border border-zinc-300 bg-transparent p-2.5 dark:border-zinc-600";

export default function CarrierCard({ onMessage }: { onMessage: (message: string) => void }) {
  const [form, setForm] = useState({ display_name: "", partner_type: "company", first_name: "", last_name: "", company_name: "", registration_number: "", address: "", email: "" });
  const [contacts, setContacts] = useState<Contact[]>([{ name: "", phone: "+371" }]);
  const [point, setPoint] = useState<Point | null>(null);
  const [focusPoint, setFocusPoint] = useState<Point | null>(null);
  const [suggestions, setSuggestions] = useState<Company[]>([]);
  const [focused, setFocused] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(true);
  const selectedName = useRef("");
  const reverseRequest = useRef(0);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("carrier_settings").select("*").eq("id", "default").maybeSingle();
      if (!data) return;
      setForm({
        display_name: data.display_name || data.company_name || "", partner_type: data.partner_type || "company",
        first_name: data.first_name || "", last_name: data.last_name || "", company_name: data.company_name || "",
        registration_number: data.registration_number || "", address: data.address || "", email: data.email || "",
      });
      const savedContacts = Array.isArray(data.contacts) ? data.contacts as Contact[] : [];
      setContacts(savedContacts.length ? savedContacts : [{ name: "", phone: "+371" }]);
      if (data.latitude !== null && data.longitude !== null) {
        const savedPoint = { lat: Number(data.latitude), lng: Number(data.longitude) };
        setPoint(savedPoint); setFocusPoint(savedPoint);
      }
      if (data.display_name || data.company_name) setFormOpen(false);
    })();
  }, []);

  useEffect(() => {
    const query = form.company_name.trim();
    if (form.partner_type !== "company" || !focused || query.length < 2 || query === selectedName.current) {
      setSuggestions([]); setSearching(false); return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/companies?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const result = await response.json() as { companies?: Company[] };
        setSuggestions(response.ok ? result.companies || [] : []);
      } catch { setSuggestions([]); }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [focused, form.company_name, form.partner_type]);

  const updatePoint = useCallback(async (nextPoint: Point) => {
    const requestId = ++reverseRequest.current;
    setPoint(nextPoint); setFocusPoint(nextPoint);
    try {
      const response = await fetch(`/api/geocode?lat=${nextPoint.lat}&lng=${nextPoint.lng}`);
      const result = await response.json() as { result?: { label?: string } };
      if (response.ok && result.result?.label && requestId === reverseRequest.current) setForm((current) => ({ ...current, address: result.result!.label! }));
    } catch { /* Punkts saglabājas arī bez adreses. */ }
  }, []);

  function chooseCompany(company: Company) {
    selectedName.current = company.name.trim(); setFocused(false); setSuggestions([]);
    setForm((current) => ({ ...current, company_name: company.name, registration_number: company.registrationNumber, address: company.address || current.address, display_name: current.display_name || company.name }));
  }

  async function save() {
    const displayName = form.display_name.trim() || (form.partner_type === "company" ? form.company_name.trim() : `${form.first_name} ${form.last_name}`.trim());
    const normalizedContacts = contacts.map((item) => ({ name: item.name.trim(), phone: item.phone.replace(/\s/g, "") }));
    const identityValid = form.partner_type === "company" ? form.company_name.trim() && form.registration_number.trim() : form.first_name.trim();
    if (!displayName || !identityValid || !form.address.trim() || !point || normalizedContacts.some((item) => !item.name || !/^\+[1-9]\d{7,14}$/.test(item.phone))) {
      onMessage("Aizpildi pārvadātāja rekvizītus, kontaktpersonas, korektus tālruņus un lokāciju."); return;
    }
    const { data: authData } = await supabase.auth.getUser();
    setSaving(true);
    const { error } = await supabase.from("carrier_settings").upsert({
      id: "default", display_name: displayName, partner_type: form.partner_type,
      first_name: form.partner_type === "private" ? form.first_name.trim() : null,
      last_name: form.partner_type === "private" ? form.last_name.trim() || null : null,
      company_name: form.partner_type === "company" ? form.company_name.trim() : "",
      registration_number: form.partner_type === "company" ? form.registration_number.trim() : null,
      address: form.address.trim(), latitude: point.lat, longitude: point.lng,
      email: form.email.trim() || null, contacts: normalizedContacts,
      updated_at: new Date().toISOString(), updated_by: authData.user?.id || null,
    });
    setSaving(false);
    if (error) {
      onMessage("Pārvadātāju neizdevās saglabāt.");
      return;
    }
    setForm((current) => ({ ...current, display_name: displayName }));
    setFormOpen(false);
    onMessage("Pārvadātājs saglabāts.");
  }

  if (!formOpen) return <section className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
    <div><h2 className="font-semibold">Pārvadātājs</h2><p className="text-sm text-zinc-500">{form.display_name || form.company_name}</p></div>
    <button type="button" onClick={() => setFormOpen(true)} className="rounded-lg border border-zinc-300 p-2 dark:border-zinc-600" aria-label="Rediģēt pārvadātāju"><Pencil size={18} /></button>
  </section>;

  return <section className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
    <h2 className="font-semibold">Pārvadātājs</h2>
    <label className="block space-y-1 text-sm"><span className="font-medium">Pārvadātāja nosaukums</span><input value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} className={inputClass} /></label>
    <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
      <h3 className="mb-3 font-semibold">Pārvadātāja rekvizīti</h3>
      <div className="mb-3 flex gap-4">
        <label className="flex items-center gap-2"><input type="radio" checked={form.partner_type === "company"} onChange={() => setForm((current) => ({ ...current, partner_type: "company" }))} /> Uzņēmums</label>
        <label className="flex items-center gap-2"><input type="radio" checked={form.partner_type === "private"} onChange={() => setForm((current) => ({ ...current, partner_type: "private" }))} /> Privātpersona</label>
      </div>
      {form.partner_type === "company" ? <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setFocused(false); setSuggestions([]); } }}>
          <label className="space-y-1 text-sm"><span className="font-medium">Uzņēmuma nosaukums *</span><input value={form.company_name} onFocus={() => setFocused(true)} onChange={(event) => { selectedName.current = ""; setForm((current) => ({ ...current, company_name: event.target.value, registration_number: "" })); }} autoComplete="off" className={inputClass} /></label>
          {searching && <span className="mt-1 block text-xs text-zinc-500">Meklē uzņēmumu...</span>}
          {suggestions.length > 0 && <div className="absolute z-[2000] mt-1 max-h-64 w-full overflow-y-auto rounded-xl border bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">{suggestions.map((company) => <button key={`${company.registrationNumber}-${company.name}`} type="button" onPointerDown={(event) => { event.preventDefault(); chooseCompany(company); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-zinc-800"><strong className="block">{company.name}</strong><span className="text-xs text-zinc-500">Reģ. Nr. {company.registrationNumber}</span></button>)}</div>}
        </div>
        <label className="space-y-1 text-sm"><span className="font-medium">Reģistrācijas/PVN numurs *</span><input value={form.registration_number} onChange={(event) => setForm((current) => ({ ...current, registration_number: event.target.value }))} className={inputClass} /></label>
      </div> : <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm"><span className="font-medium">Vārds *</span><input value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} className={inputClass} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium">Uzvārds</span><input value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} className={inputClass} /></label>
      </div>}
    </div>
    <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
      <div className="flex items-center justify-between"><h3 className="font-semibold">Kontaktpersonas</h3><button type="button" onClick={() => setContacts((current) => [...current, { name: "", phone: "+371" }])} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm"><Plus size={16} /> Pievienot</button></div>
      {contacts.map((contact, index) => <div key={index} className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="space-y-1 text-sm"><span className="font-medium">Kontaktpersona *</span><input value={contact.name} onChange={(event) => setContacts((current) => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} className={inputClass} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium">Tālrunis *</span><input type="tel" value={contact.phone} onChange={(event) => setContacts((current) => current.map((item, i) => i === index ? { ...item, phone: event.target.value } : item))} className={inputClass} /></label>
        <button type="button" disabled={contacts.length === 1} onClick={() => setContacts((current) => current.filter((_, i) => i !== index))} className="rounded-lg border border-red-300 p-2.5 text-red-600 disabled:opacity-30"><Trash2 size={18} /></button>
      </div>)}
      <label className="block space-y-1 text-sm"><span className="font-medium">E-pasts</span><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className={inputClass} /></label>
    </div>
    <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-700"><h3 className="font-semibold">Lokācija</h3><AddressField id="carrier-address" value={form.address} onChange={(address) => setForm((current) => ({ ...current, address }))} onMapFocus={(next) => { setPoint(next); setFocusPoint(next); }} onLocationImport={updatePoint} /><LocationPicker point={point} focusPoint={focusPoint} onChange={updatePoint} /></div>
    <button type="button" onClick={() => void save()} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50 sm:w-auto"><Check size={18} />{saving ? "Saglabā..." : "Saglabāt"}</button>
  </section>;
}
