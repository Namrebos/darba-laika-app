"use client";

import { Building2, Check, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type PartnerType = "private" | "company";
type Partner = {
  id: number;
  partner_type: PartnerType;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  registration_number: string | null;
  address: string;
  phone: string;
  email: string | null;
};

const emptyForm = {
  partner_type: "company" as PartnerType,
  first_name: "",
  last_name: "",
  company_name: "",
  registration_number: "",
  address: "",
  phone: "+371",
  email: "",
};

function partnerName(partner: Partner) {
  return partner.partner_type === "company"
    ? partner.company_name || "Uzņēmums"
    : [partner.first_name, partner.last_name].filter(Boolean).join(" ");
}

export default function PartnersPage() {
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  async function loadPartners() {
    const { data, error } = await supabase
      .from("partners")
      .select("id, partner_type, first_name, last_name, company_name, registration_number, address, phone, email")
      .order("company_name", { nullsFirst: false })
      .order("first_name", { nullsFirst: false });
    if (error) {
      setMessage("Partneru sarakstu neizdevās ielādēt.");
      return;
    }
    setPartners((data || []) as Partner[]);
  }

  useEffect(() => {
    async function load() {
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
      await loadPartners();
      setLoading(false);
    }
    void load();
  }, [router]);

  const filteredPartners = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("lv");
    if (!query) return partners;
    return partners.filter((partner) =>
      [partnerName(partner), partner.registration_number, partner.address, partner.phone, partner.email]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("lv").includes(query)),
    );
  }, [partners, search]);

  function clearForm() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage("");
  }

  function editPartner(partner: Partner) {
    setEditingId(partner.id);
    setForm({
      partner_type: partner.partner_type,
      first_name: partner.first_name || "",
      last_name: partner.last_name || "",
      company_name: partner.company_name || "",
      registration_number: partner.registration_number || "",
      address: partner.address,
      phone: partner.phone,
      email: partner.email || "",
    });
    setMessage("");
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function savePartner() {
    const identityValid = form.partner_type === "company"
      ? form.company_name.trim() && form.registration_number.trim()
      : form.first_name.trim();
    if (!identityValid || !form.address.trim() || !/^\+[1-9]\d{7,14}$/.test(form.phone.replace(/\s/g, ""))) {
      setMessage("Aizpildi obligātos laukus un ievadi korektu tālruni ar valsts kodu.");
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    setSaving(true);
    setMessage("");
    const values = {
      partner_type: form.partner_type,
      first_name: form.partner_type === "private" ? form.first_name.trim() : null,
      last_name: form.partner_type === "private" ? form.last_name.trim() || null : null,
      company_name: form.partner_type === "company" ? form.company_name.trim() : null,
      registration_number: form.partner_type === "company" ? form.registration_number.trim() : null,
      address: form.address.trim(),
      phone: form.phone.replace(/\s/g, ""),
      email: form.email.trim() || null,
      created_by: authData.user.id,
      updated_at: new Date().toISOString(),
    };
    const { error } = editingId
      ? await supabase.from("partners").update(values).eq("id", editingId)
      : await supabase.from("partners").insert(values);
    setSaving(false);
    if (error) {
      setMessage("Partneri neizdevās saglabāt.");
      return;
    }
    const wasEditing = editingId !== null;
    clearForm();
    await loadPartners();
    setMessage(wasEditing ? "Partnera izmaiņas saglabātas." : "Partneris pievienots.");
  }

  async function deletePartner(partner: Partner) {
    if (!window.confirm(`Vai tiešām dzēst partneri “${partnerName(partner)}”?`)) return;
    const { error } = await supabase.from("partners").delete().eq("id", partner.id);
    if (error) {
      setMessage("Partneri neizdevās dzēst.");
      return;
    }
    if (editingId === partner.id) clearForm();
    await loadPartners();
    setMessage("Partneris izdzēsts.");
  }

  if (loading) return <p className="p-6">Ielādē...</p>;

  const inputClass = "w-full rounded-lg border border-zinc-300 bg-transparent p-2.5 dark:border-zinc-600";

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4">
      <div>
        <h1 className="text-2xl font-bold">Partneri</h1>
        <p className="mt-1 text-sm text-zinc-500">Pārvaldi klientus un pavadzīmēs izmantojamos rekvizītus.</p>
      </div>

      {message && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">{message}</p>}

      <section className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">{editingId ? "Rediģēt partneri" : "Pievienot partneri"}</h2>
          {editingId && <button type="button" onClick={clearForm} className="flex items-center gap-1 text-sm text-zinc-500"><X size={17} /> Atcelt</button>}
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2"><input type="radio" checked={form.partner_type === "company"} onChange={() => setForm((current) => ({ ...current, partner_type: "company" }))} /> Uzņēmums</label>
          <label className="flex items-center gap-2"><input type="radio" checked={form.partner_type === "private"} onChange={() => setForm((current) => ({ ...current, partner_type: "private" }))} /> Privātpersona</label>
        </div>

        {form.partner_type === "company" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm"><span className="font-medium">Uzņēmuma nosaukums *</span><input value={form.company_name} onChange={(event) => setForm((current) => ({ ...current, company_name: event.target.value }))} className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span className="font-medium">Reģistrācijas/PVN numurs *</span><input value={form.registration_number} onChange={(event) => setForm((current) => ({ ...current, registration_number: event.target.value }))} className={inputClass} /></label>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm"><span className="font-medium">Vārds *</span><input value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} className={inputClass} /></label>
            <label className="space-y-1 text-sm"><span className="font-medium">Uzvārds</span><input value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} className={inputClass} /></label>
          </div>
        )}

        <label className="block space-y-1 text-sm"><span className="font-medium">Adrese *</span><input value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} className={inputClass} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm"><span className="font-medium">Tālrunis *</span><input type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+37120123456" className={inputClass} /></label>
          <label className="space-y-1 text-sm"><span className="font-medium">E-pasts</span><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className={inputClass} /></label>
        </div>

        <button type="button" onClick={() => void savePartner()} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50 sm:w-auto">
          {editingId ? <Check size={18} /> : <Plus size={18} />}{saving ? "Saglabā..." : "Saglabāt"}
        </button>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h2 className="font-semibold">Partneri ({partners.length})</h2>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Meklēt partneri" className={`${inputClass} sm:max-w-xs`} />
        </div>
        {filteredPartners.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">Partneri nav atrasti.</p>
        ) : filteredPartners.map((partner) => (
          <article key={partner.id} className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
            <div className="flex min-w-0 gap-3">
              <div className="mt-0.5 rounded-lg bg-blue-50 p-2 text-blue-700 dark:bg-blue-950 dark:text-blue-300">{partner.partner_type === "company" ? <Building2 size={20} /> : <UserRound size={20} />}</div>
              <div className="min-w-0">
                <h3 className="font-semibold">{partnerName(partner)}</h3>
                {partner.registration_number && <p className="text-sm text-zinc-500">Reģ./PVN: {partner.registration_number}</p>}
                <p className="text-sm text-zinc-500">{partner.address}</p>
                <p className="text-sm text-zinc-500">{partner.phone}{partner.email ? ` · ${partner.email}` : ""}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => editPartner(partner)} className="rounded-lg border border-zinc-300 p-2 dark:border-zinc-600" aria-label="Rediģēt partneri"><Pencil size={18} /></button>
              <button type="button" onClick={() => void deletePartner(partner)} className="rounded-lg border border-red-300 p-2 text-red-600 dark:border-red-800" aria-label="Dzēst partneri"><Trash2 size={18} /></button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
