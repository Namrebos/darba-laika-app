"use client";

import dynamic from "next/dynamic";
import { Building2, Check, Copy, Link2, Link2Off, Pencil, Plus, RefreshCw, Trash2, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddressField from "@/app/components/AddressField";
import { supabase } from "@/lib/supabaseClient";

const LocationPicker = dynamic(() => import("@/app/components/LocationPicker"), { ssr: false });

type PartnerType = "private" | "company";
type Point = { lat: number; lng: number };
type CompanySuggestion = { name: string; registrationNumber: string; address: string };
type PartnerContact = { id?: number; name: string; phone: string; sort_order: number };
type Partner = {
  id: number; display_name: string; partner_type: PartnerType;
  first_name: string | null; last_name: string | null;
  company_name: string | null; registration_number: string | null;
  contact_name: string | null; address: string;
  latitude: number | null; longitude: number | null;
  phone: string; email: string | null; contacts: PartnerContact[];
};
type PartnerRequestLink = { partnerId: number; active: boolean; url: string };

const emptyForm = {
  display_name: "", partner_type: "company" as PartnerType,
  first_name: "", last_name: "", company_name: "", registration_number: "",
  address: "", email: "",
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
  const [contacts, setContacts] = useState<PartnerContact[]>([{ name: "", phone: "+371", sort_order: 0 }]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [requestLinks, setRequestLinks] = useState<Record<number, PartnerRequestLink>>({});
  const [linkMenuPartnerId, setLinkMenuPartnerId] = useState<number | null>(null);
  const [linkBusyPartnerId, setLinkBusyPartnerId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [companySuggestions, setCompanySuggestions] = useState<CompanySuggestion[]>([]);
  const [companySearchField, setCompanySearchField] = useState<"name" | "registration" | null>(null);
  const [companySearchLoading, setCompanySearchLoading] = useState(false);
  const selectedCompanyNameRef = useRef("");
  const reverseRequestRef = useRef(0);

  async function loadPartners() {
    const [{ data, error }, { data: contactRows, error: contactsError }] = await Promise.all([
      supabase.from("partners")
        .select("id, display_name, partner_type, first_name, last_name, company_name, registration_number, contact_name, address, latitude, longitude, phone, email")
        .order("display_name"),
      supabase.from("partner_contacts").select("id, partner_id, name, phone, sort_order").order("sort_order").order("id"),
    ]);
    if (error || contactsError) { setMessage("Partneru sarakstu neizdevās ielādēt."); return; }
    const groupedContacts = new Map<number, PartnerContact[]>();
    for (const row of contactRows || []) {
      const partnerId = Number(row.partner_id);
      const current = groupedContacts.get(partnerId) || [];
      current.push({ id: Number(row.id), name: String(row.name), phone: String(row.phone), sort_order: Number(row.sort_order) });
      groupedContacts.set(partnerId, current);
    }
    setPartners(((data || []) as Omit<Partner, "contacts">[]).map((partner) => ({
      ...partner,
      contacts: groupedContacts.get(partner.id) || (partner.contact_name ? [{ name: partner.contact_name, phone: partner.phone, sort_order: 0 }] : []),
    })));
  }

  async function loadPartnerLinks() {
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/admin/partner-request-links", {
      headers: { Authorization: `Bearer ${data.session?.access_token || ""}` },
    });
    if (!response.ok) return;
    const result = await response.json() as { links?: PartnerRequestLink[] };
    setRequestLinks(Object.fromEntries((result.links || []).map((link) => [link.partnerId, link])));
  }

  useEffect(() => {
    async function load() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", authData.user.id).single();
      if (profile?.role !== "admin") { router.replace("/summary"); return; }
      await Promise.all([loadPartners(), loadPartnerLinks()]);
      setLoading(false);
    }
    void load();
  }, [router]);

  useEffect(() => {
    const query = (companySearchField === "registration" ? form.registration_number : form.company_name).trim();
    if (form.partner_type !== "company" || !companySearchField || query.length < 2 || (companySearchField === "name" && query === selectedCompanyNameRef.current)) {
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
  }, [companySearchField, form.company_name, form.partner_type, form.registration_number]);

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

  function clearForm(close = true) {
    setEditingId(null); setForm(emptyForm); setPoint(null); setFocusPoint(null);
    setContacts([{ name: "", phone: "+371", sort_order: 0 }]);
    setCompanySuggestions([]); setMessage(""); setFormOpen(!close);
  }

  function editPartner(partner: Partner) {
    setEditingId(partner.id);
    setForm({
      display_name: partner.display_name, partner_type: partner.partner_type,
      first_name: partner.first_name || "", last_name: partner.last_name || "",
      company_name: partner.company_name || "", registration_number: partner.registration_number || "",
      address: partner.address, email: partner.email || "",
    });
    setContacts(partner.contacts.length > 0 ? partner.contacts.map((contact, index) => ({ ...contact, sort_order: index })) : [{ name: "", phone: "+371", sort_order: 0 }]);
    const savedPoint = partner.latitude !== null && partner.longitude !== null ? { lat: partner.latitude, lng: partner.longitude } : null;
    setPoint(savedPoint); setFocusPoint(savedPoint); setMessage(""); setFormOpen(true);
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selectCompany(company: CompanySuggestion) {
    selectedCompanyNameRef.current = company.name.trim();
    setCompanySearchField(null);
    setCompanySuggestions([]);
    setForm((current) => ({
      ...current,
      company_name: company.name,
      registration_number: company.registrationNumber,
      address: company.address || current.address,
      display_name: current.display_name || company.name,
    }));
  }

  async function savePartner() {
    const displayName = form.display_name.trim() || identityName(form);
    const identityValid = form.partner_type === "company"
      ? form.company_name.trim() && form.registration_number.trim()
      : form.first_name.trim();
    const normalizedContacts = contacts.map((contact, index) => ({
      name: contact.name.trim(), phone: contact.phone.replace(/\s/g, ""), sort_order: index,
    }));
    const contactsValid = normalizedContacts.length > 0 && normalizedContacts.every((contact) => contact.name && /^\+[1-9]\d{7,14}$/.test(contact.phone));
    if (!displayName || !identityValid || !contactsValid || !form.address.trim() || !point) {
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
      contact_name: normalizedContacts[0].name, address: form.address.trim(),
      latitude: point.lat, longitude: point.lng, phone: normalizedContacts[0].phone,
      email: form.email.trim() || null, created_by: authData.user.id,
      updated_at: new Date().toISOString(),
    };
    const { data: savedPartner, error } = editingId
      ? await supabase.from("partners").update(values).eq("id", editingId).select("id").single()
      : await supabase.from("partners").insert(values).select("id").single();
    if (error || !savedPartner) { setSaving(false); setMessage("Partneri neizdevās saglabāt."); return; }
    const partnerId = Number(savedPartner.id);
    if (editingId) await supabase.from("partner_contacts").delete().eq("partner_id", partnerId);
    const { error: contactsSaveError } = await supabase.from("partner_contacts").insert(
      normalizedContacts.map((contact) => ({ ...contact, partner_id: partnerId })),
    );
    setSaving(false);
    if (contactsSaveError) { setMessage("Partneris saglabāts, bet kontaktpersonas neizdevās saglabāt."); return; }
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

  async function copyPartnerLink(url: string) {
    await navigator.clipboard.writeText(url);
    setMessage("Partnera pieteikuma saite nokopēta.");
    setLinkMenuPartnerId(null);
  }

  async function updatePartnerLink(partnerId: number, action: "create" | "rotate" | "deactivate") {
    setLinkBusyPartnerId(partnerId);
    setMessage("");
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/admin/partner-request-links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.session?.access_token || ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ partnerId, action }),
    });
    const result = await response.json() as { active?: boolean; url?: string; error?: string };
    setLinkBusyPartnerId(null);
    if (!response.ok) {
      setMessage(result.error || "Darbību ar saiti neizdevās izpildīt.");
      return;
    }
    const link = { partnerId, active: Boolean(result.active), url: result.url || "" };
    setRequestLinks((current) => ({ ...current, [partnerId]: link }));
    setLinkMenuPartnerId(null);
    if (action === "deactivate") {
      setMessage("Partnera pieteikuma saite deaktivizēta.");
    } else {
      await navigator.clipboard.writeText(link.url);
      setMessage(action === "rotate" ? "Izveidota un nokopēta jauna saite. Vecā saite vairs nav derīga." : "Pieteikuma saite izveidota un nokopēta.");
    }
  }

  if (loading) return <p className="p-6">Ielādē...</p>;
  const inputClass = "w-full rounded-lg border border-zinc-300 bg-transparent p-2.5 dark:border-zinc-600";

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Partneri</h1><p className="mt-1 text-sm text-zinc-500">Pārvaldi klientus, kontaktus, rekvizītus un lokācijas.</p></div>
        {!formOpen && <button type="button" onClick={() => clearForm(false)} className="flex shrink-0 items-center gap-2 rounded-lg bg-green-600 px-3 py-2 font-semibold text-white"><Plus size={18} /> Pievienot jaunu</button>}
      </div>
      {message && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">{message}</p>}

      {formOpen && <section className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">{editingId ? "Rediģēt partneri" : "Pievienot partneri"}</h2>
          {editingId && <button type="button" onClick={() => clearForm()} className="flex items-center gap-1 text-sm text-zinc-500"><X size={17} /> Atcelt</button>}
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
              <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setCompanySearchField(null); setCompanySuggestions([]); } }}>
                <label className="space-y-1 text-sm"><span className="font-medium">Uzņēmuma nosaukums *</span><input value={form.company_name} onFocus={() => setCompanySearchField("name")} onChange={(event) => { selectedCompanyNameRef.current = ""; setForm((current) => ({ ...current, company_name: event.target.value, registration_number: "" })); }} autoComplete="off" className={inputClass} /></label>
                {companySearchField === "name" && companySearchLoading && <span className="mt-1 block text-xs text-zinc-500">Meklē uzņēmumu...</span>}
                {companySearchField === "name" && companySuggestions.length > 0 && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                  {companySuggestions.map((company) => <button key={`${company.registrationNumber}-${company.name}`} type="button" onPointerDown={(event) => { event.preventDefault(); selectCompany(company); }} onClick={() => selectCompany(company)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-zinc-800"><strong className="block">{company.name}</strong><span className="block text-xs text-zinc-500">Reģ. Nr. {company.registrationNumber}{company.address ? ` · ${company.address}` : ""}</span></button>)}
                </div>}
              </div>
              <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setCompanySearchField(null); setCompanySuggestions([]); } }}>
                <label className="space-y-1 text-sm"><span className="font-medium">Reģistrācijas/PVN numurs *</span><input value={form.registration_number} onFocus={() => setCompanySearchField("registration")} onChange={(event) => setForm((current) => ({ ...current, registration_number: event.target.value }))} autoComplete="off" className={inputClass} /></label>
                {companySearchField === "registration" && companySearchLoading && <span className="mt-1 block text-xs text-zinc-500">Meklē uzņēmumu...</span>}
                {companySearchField === "registration" && companySuggestions.length > 0 && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                  {companySuggestions.map((company) => <button key={`${company.registrationNumber}-${company.name}`} type="button" onPointerDown={(event) => { event.preventDefault(); selectCompany(company); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-zinc-800"><strong className="block">{company.name}</strong><span className="block text-xs text-zinc-500">Reģ. Nr. {company.registrationNumber}{company.address ? ` · ${company.address}` : ""}</span></button>)}
                </div>}
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm"><span className="font-medium">Vārds *</span><input value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} className={inputClass} /></label>
              <label className="space-y-1 text-sm"><span className="font-medium">Uzvārds</span><input value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} className={inputClass} /></label>
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Kontaktpersonas</h3><button type="button" onClick={() => setContacts((current) => [...current, { name: "", phone: "+371", sort_order: current.length }])} className="flex items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm dark:border-zinc-600"><Plus size={16} /> Pievienot</button></div>
          {contacts.map((contact, index) => <div key={contact.id ?? `new-${index}`} className="grid items-end gap-2 rounded-lg border border-zinc-200 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] dark:border-zinc-700">
            <label className="space-y-1 text-sm"><span className="font-medium">Kontaktpersona *</span><input value={contact.name} onChange={(event) => setContacts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span className="font-medium">Tālrunis *</span><input type="tel" value={contact.phone} onChange={(event) => setContacts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, phone: event.target.value } : item))} placeholder="+37120123456" className={inputClass} /></label>
            <button type="button" disabled={contacts.length === 1} onClick={() => setContacts((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="justify-self-end rounded-lg border border-red-300 p-2.5 text-red-600 disabled:opacity-30 dark:border-red-800" aria-label="Dzēst kontaktpersonu"><Trash2 size={18} /></button>
          </div>)}
          <label className="block space-y-1 text-sm"><span className="font-medium">E-pasts</span><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className={inputClass} /></label>
        </div>

        <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <h3 className="font-semibold">Lokācija</h3>
          <AddressField id="partner-address" value={form.address} onChange={(address) => setForm((current) => ({ ...current, address }))} onMapFocus={(nextPoint) => { setPoint(nextPoint); setFocusPoint(nextPoint); }} onLocationImport={updatePoint} />
          <LocationPicker key={`${editingId ?? "new"}-${formOpen}`} point={point} focusPoint={focusPoint} onChange={updatePoint} active={formOpen} />
        </div>

        <button type="button" onClick={() => void savePartner()} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50 sm:w-auto">{editingId ? <Check size={18} /> : <Plus size={18} />}{saving ? "Saglabā..." : "Saglabāt"}</button>
      </section>}

      <section className="space-y-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><h2 className="font-semibold">Partneri ({partners.length})</h2><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Meklēt partneri" className={`${inputClass} sm:max-w-xs`} /></div>
        {filteredPartners.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">Partneri nav atrasti.</p> : filteredPartners.map((partner) => (
          <article key={partner.id} className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
            <div className="flex min-w-0 gap-3"><div className="mt-0.5 rounded-lg bg-blue-50 p-2 text-blue-700 dark:bg-blue-950 dark:text-blue-300">{partner.partner_type === "company" ? <Building2 size={20} /> : <UserRound size={20} />}</div><div className="min-w-0"><h3 className="font-semibold">{partner.display_name}</h3>{partner.company_name && partner.company_name !== partner.display_name && <p className="text-sm text-zinc-500">{partner.company_name}</p>}{partner.registration_number && <p className="text-sm text-zinc-500">Reģ./PVN: {partner.registration_number}</p>}{partner.contacts.map((contact) => <p key={contact.id ?? `${contact.name}-${contact.phone}`} className="text-sm text-zinc-500">{contact.name}: {contact.phone}</p>)}<p className="text-sm text-zinc-500">{partner.address}</p>{partner.email && <p className="text-sm text-zinc-500">{partner.email}</p>}{requestLinks[partner.id]?.active && <div className="mt-3 max-w-xl rounded-lg bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800"><span className="block font-medium">Pieteikuma saite</span><a href={requestLinks[partner.id].url} target="_blank" rel="noreferrer" className="block truncate text-blue-600 underline">{requestLinks[partner.id].url}</a></div>}</div></div>
            <div className="relative flex shrink-0 gap-2">
              <button type="button" onClick={() => setLinkMenuPartnerId((current) => current === partner.id ? null : partner.id)} className="rounded-lg border border-zinc-300 p-2 text-blue-600 dark:border-zinc-600" aria-label="Pieteikuma saite"><Link2 size={18} /></button>
              <button type="button" onClick={() => editPartner(partner)} className="rounded-lg border border-zinc-300 p-2 dark:border-zinc-600" aria-label="Rediģēt partneri"><Pencil size={18} /></button><button type="button" onClick={() => void deletePartner(partner)} className="rounded-lg border border-red-300 p-2 text-red-600 dark:border-red-800" aria-label="Dzēst partneri"><Trash2 size={18} /></button>
              {linkMenuPartnerId === partner.id && <div className="absolute right-0 top-11 z-30 w-64 space-y-1 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                {!requestLinks[partner.id]?.active ? <button type="button" disabled={linkBusyPartnerId === partner.id} onClick={() => void updatePartnerLink(partner.id, "create")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"><Link2 size={17} /> Izveidot pieteikuma saiti</button> : <>
                  <button type="button" onClick={() => void copyPartnerLink(requestLinks[partner.id].url)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"><Copy size={17} /> Kopēt saiti</button>
                  <button type="button" disabled={linkBusyPartnerId === partner.id} onClick={() => void updatePartnerLink(partner.id, "deactivate")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"><Link2Off size={17} /> Deaktivizēt saiti</button>
                  <button type="button" disabled={linkBusyPartnerId === partner.id} onClick={() => void updatePartnerLink(partner.id, "rotate")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"><RefreshCw size={17} /> Izveidot jaunu saiti</button>
                </>}
              </div>}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
