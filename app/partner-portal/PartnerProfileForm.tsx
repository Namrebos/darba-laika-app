"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Plus, Trash2, X } from "lucide-react";
import AddressField from "@/app/components/AddressField";
import { isValidInternationalPhone, normalizeInternationalPhoneInput } from "@/lib/phoneInput";
import { shortPartnerName } from "@/lib/partnerName";

const LocationPicker = dynamic(() => import("@/app/components/LocationPicker"), { ssr: false });

type Point = { lat: number; lng: number };
type PartnerType = "private" | "company";
type PartnerContact = { id?: number; name: string; phone: string; sort_order: number };
type CompanySuggestion = { name: string; registrationNumber: string; address: string };

export type PortalPartner = {
  id: number;
  display_name: string;
  partner_type: PartnerType;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  registration_number: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  email: string | null;
  logo_url: string | null;
  profile_completed: boolean;
  contacts: PartnerContact[];
};

export default function PartnerProfileForm({ partner, authorizedFetch, onSaved, onCancel }: {
  partner: PortalPartner;
  authorizedFetch: (url: string, init?: RequestInit) => Promise<Response | null>;
  onSaved: () => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState({
    display_name: partner.display_name || "",
    partner_type: partner.partner_type || "company" as PartnerType,
    first_name: partner.first_name || "",
    last_name: partner.last_name || "",
    company_name: partner.company_name || "",
    registration_number: partner.registration_number || "",
    address: partner.address || "",
    email: partner.email || "",
  });
  const [contacts, setContacts] = useState<PartnerContact[]>(partner.contacts.length > 0
    ? partner.contacts
    : [{ name: "", phone: "+371", sort_order: 0 }]);
  const savedPoint = partner.latitude !== null && partner.longitude !== null
    ? { lat: partner.latitude, lng: partner.longitude }
    : null;
  const [point, setPoint] = useState<Point | null>(savedPoint);
  const [focusPoint, setFocusPoint] = useState<Point | null>(savedPoint);
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
  const [searchField, setSearchField] = useState<"name" | "registration" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const selectedCompanyRef = useRef("");
  const reverseRequestRef = useRef(0);

  useEffect(() => {
    const query = (searchField === "registration" ? form.registration_number : form.company_name).trim();
    if (form.partner_type !== "company" || !searchField || query.length < 2 || (searchField === "name" && query === selectedCompanyRef.current)) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/companies?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const result = await response.json() as { companies?: CompanySuggestion[] };
        setSuggestions(response.ok ? result.companies || [] : []);
      } catch (fetchError) {
        if (!(fetchError instanceof DOMException && fetchError.name === "AbortError")) setSuggestions([]);
      }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [form.company_name, form.partner_type, form.registration_number, searchField]);

  useEffect(() => () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
  }, [logoPreview]);

  const updatePoint = useCallback(async (nextPoint: Point) => {
    const requestId = ++reverseRequestRef.current;
    setPoint(nextPoint);
    setFocusPoint(nextPoint);
    try {
      const response = await fetch(`/api/geocode?lat=${encodeURIComponent(nextPoint.lat)}&lng=${encodeURIComponent(nextPoint.lng)}`);
      const result = await response.json() as { result?: { label?: string } | null };
      const label = result.result?.label?.trim();
      if (response.ok && label && requestId === reverseRequestRef.current) {
        setForm((current) => ({ ...current, address: label }));
      }
    } catch { /* Saglabājam koordinātes arī tad, ja adresi neizdodas atrast. */ }
  }, []);

  function selectCompany(company: CompanySuggestion) {
    selectedCompanyRef.current = company.name.trim();
    setSuggestions([]);
    setSearchField(null);
    setForm((current) => ({
      ...current,
      company_name: company.name,
      registration_number: company.registrationNumber,
      address: company.address || current.address,
      display_name: current.display_name || shortPartnerName(company.name),
    }));
  }

  async function save() {
    const normalizedContacts = contacts.map((contact, index) => ({
      name: contact.name.trim(),
      phone: contact.phone.replace(/\s/g, ""),
      sort_order: index,
    }));
    const identityValid = form.partner_type === "company"
      ? Boolean(form.company_name.trim() && form.registration_number.trim())
      : Boolean(form.first_name.trim());
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
    const contactsValid = normalizedContacts.length > 0
      && normalizedContacts.every((contact) => contact.name && isValidInternationalPhone(contact.phone));
    if (!form.display_name.trim() || !identityValid || !emailValid || !contactsValid || !form.address.trim() || !point) {
      setError("Aizpildi visus obligātos laukus, korektu e-pastu, kontaktpersonu un atzīmē lokāciju kartē.");
      return;
    }
    setSaving(true);
    setError("");
    const response = await authorizedFetch("/api/partner-portal/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, latitude: point.lat, longitude: point.lng, contacts: normalizedContacts }),
    });
    const result = response ? await response.json() as { error?: string } : {};
    if (!response?.ok) {
      setSaving(false);
      setError(result.error || "Partnera kartīti neizdevās saglabāt.");
      return;
    }
    if (logoFile) {
      const logoData = new FormData();
      logoData.append("logo", logoFile);
      const logoResponse = await authorizedFetch("/api/partner-portal/profile/logo", { method: "POST", body: logoData });
      if (!logoResponse?.ok) {
        setSaving(false);
        const logoResult = logoResponse ? await logoResponse.json() as { error?: string } : {};
        setError(logoResult.error || "Partnera dati saglabāti, bet logo neizdevās saglabāt.");
        return;
      }
    } else if (removeLogo && partner.logo_url) {
      const logoResponse = await authorizedFetch("/api/partner-portal/profile/logo", { method: "DELETE" });
      if (!logoResponse?.ok) {
        setSaving(false);
        setError("Partnera dati saglabāti, bet logo neizdevās dzēst.");
        return;
      }
    }
    setSaving(false);
    await onSaved();
  }

  const inputClass = "w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-950";
  return (
    <section className="mx-auto w-full max-w-3xl space-y-5 rounded-2xl bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">{partner.profile_completed ? "Partnera kartīte" : "Aizpildi partnera kartīti"}</h1>
        <p className="mt-1 text-sm text-slate-500">{partner.profile_completed ? "Izmaiņas būs redzamas arī AB-buss partneru sadaļā." : "Pirms portāla lietošanas nepieciešami partnera rekvizīti, kontakti un lokācija."}</p></div>
        {onCancel && <button type="button" onClick={onCancel} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Aizvērt partnera kartīti"><X size={20} /></button>}
      </div>
      <label className="block space-y-1 text-sm font-medium">Partnera nosaukums *
        <input value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} className={inputClass} />
      </label>
      <div className="space-y-2 border-t border-slate-200 pt-5">
        <span className="block text-sm font-medium">Partnera logo</span>
        <div className="flex flex-wrap items-center gap-3">
          {(logoPreview || (!removeLogo && partner.logo_url)) && <div className="relative"><img src={logoPreview || partner.logo_url || ""} alt="Partnera logo priekšskatījums" className="h-24 w-24 rounded-xl border border-slate-200 bg-white object-contain p-2" /><button type="button" onClick={() => { setLogoFile(null); setLogoPreview(null); setRemoveLogo(true); }} className="absolute -right-2 -top-2 rounded-full bg-red-600 p-1 text-white" aria-label="Dzēst partnera logo"><X size={16} /></button></div>}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"><ImagePlus size={18} />{partner.logo_url && !removeLogo ? "Mainīt logo" : "Pievienot logo"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) { setError("Logo faila izmērs nedrīkst pārsniegt 5 MB."); event.target.value = ""; return; } if (logoPreview) URL.revokeObjectURL(logoPreview); setLogoFile(file); setLogoPreview(URL.createObjectURL(file)); setRemoveLogo(false); event.target.value = ""; }} /></label>
        </div>
        <p className="text-xs text-slate-500">JPG, PNG vai WEBP fails līdz 5 MB.</p>
      </div>
      <label className="block space-y-1 text-sm font-medium">Partnera veids *
        <select value={form.partner_type} onChange={(event) => setForm((current) => ({ ...current, partner_type: event.target.value as PartnerType }))} className={inputClass}>
          <option value="company">Uzņēmums</option>
          <option value="private">Privātpersona</option>
        </select>
      </label>
      {form.partner_type === "company" ? (
        <div className="relative grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Uzņēmuma nosaukums *
            <input value={form.company_name} onFocus={() => setSearchField("name")} onChange={(event) => { selectedCompanyRef.current = ""; setSearchField("name"); setForm((current) => ({ ...current, company_name: event.target.value })); }} className={inputClass} />
          </label>
          <label className="space-y-1 text-sm font-medium">Reģistrācijas/PVN numurs *
            <input value={form.registration_number} onFocus={() => setSearchField("registration")} onChange={(event) => { setSearchField("registration"); setForm((current) => ({ ...current, registration_number: event.target.value })); }} className={inputClass} />
          </label>
          {suggestions.length > 0 && <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
            {suggestions.map((company) => <button key={`${company.registrationNumber}-${company.name}`} type="button" onPointerDown={(event) => { event.preventDefault(); selectCompany(company); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50"><strong className="block">{company.name}</strong><span className="text-xs text-slate-500">Reģ. Nr. {company.registrationNumber}{company.address ? ` · ${company.address}` : ""}</span></button>)}
          </div>}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Vārds *<input value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} className={inputClass} /></label>
          <label className="space-y-1 text-sm font-medium">Uzvārds<input value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} className={inputClass} /></label>
        </div>
      )}
      <div className="space-y-3 border-t border-slate-200 pt-5">
        <div className="flex items-center justify-between gap-3"><h2 className="font-bold">Kontaktpersonas</h2><button type="button" onClick={() => setContacts((current) => [...current, { name: "", phone: "+371", sort_order: current.length }])} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"><Plus size={16} /> Pievienot</button></div>
        {contacts.map((contact, index) => <div key={contact.id ?? `new-${index}`} className="grid items-end gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="space-y-1 text-sm font-medium">Kontaktpersona *<input value={contact.name} onChange={(event) => setContacts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} className={inputClass} /></label>
          <label className="space-y-1 text-sm font-medium">Tālrunis *<input type="tel" value={contact.phone} onChange={(event) => setContacts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, phone: normalizeInternationalPhoneInput(event.target.value) } : item))} className={inputClass} /></label>
          <button type="button" disabled={contacts.length === 1} onClick={() => setContacts((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg border border-red-300 p-3 text-red-600 disabled:opacity-30" aria-label="Dzēst kontaktpersonu"><Trash2 size={18} /></button>
        </div>)}
        <label className="block space-y-1 text-sm font-medium">E-pasts *<input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className={inputClass} /></label>
      </div>
      <div className="space-y-3 border-t border-slate-200 pt-5">
        <h2 className="font-bold">Lokācija *</h2>
        <AddressField id="partner-portal-address" value={form.address} onChange={(address) => setForm((current) => ({ ...current, address }))} onMapFocus={(nextPoint) => { setPoint(nextPoint); setFocusPoint(nextPoint); }} onLocationImport={updatePoint} />
        <LocationPicker point={point} focusPoint={focusPoint} onChange={updatePoint} active />
      </div>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white disabled:opacity-50"><Check size={18} /> {saving ? "Saglabā..." : "Saglabāt partnera kartīti"}</button>
    </section>
  );
}
