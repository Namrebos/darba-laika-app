"use client";

import { Check, ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type CargoType = {
  id: number;
  name: string;
  parent_id: number | null;
};

export default function CargoTypesPage() {
  const router = useRouter();
  const [cargoTypes, setCargoTypes] = useState<CargoType[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [subtypeName, setSubtypeName] = useState("");
  const [weightNames, setWeightNames] = useState<Record<number, string>>({});

  async function loadCargoTypes() {
    const { data, error } = await supabase
      .from("cargo_types")
      .select("id, name, parent_id")
      .order("name");
    if (error) {
      setMessage("Kravas veidus neizdevās ielādēt.");
      return;
    }
    setCargoTypes((data || []) as CargoType[]);
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
        .select("role, can_access_cargo_types")
        .eq("id", authData.user.id)
        .single();
      if (profile?.role !== "admin" && profile?.can_access_cargo_types !== true) {
        router.replace("/summary");
        return;
      }
      await loadCargoTypes();
      setLoading(false);
    }
    void load();
  }, [router]);

  function clearForm() {
    setEditingId(null);
    setName("");
  }

  async function saveCargoType() {
    if (!name.trim()) {
      setMessage("Ievadi kravas veida nosaukumu.");
      return;
    }
    setSaving(true);
    setMessage("");
    const wasEditing = editingId !== null;
    const { error } = editingId
      ? await supabase.rpc("update_cargo_type", {
          target_cargo_type_id: editingId,
          cargo_type_name: name,
        })
      : await supabase.rpc("add_cargo_type", { cargo_type_name: name });
    setSaving(false);
    if (error) {
      setMessage(
        error.message.includes("duplicate")
          ? "Šāds kravas veids jau pastāv."
          : "Kravas veidu neizdevās saglabāt.",
      );
      return;
    }
    clearForm();
    await loadCargoTypes();
    setMessage(wasEditing ? "Izmaiņas saglabātas." : "Kravas veids pievienots.");
  }

  async function deleteCargoType(cargoType: CargoType) {
    if (!window.confirm(`Vai dzēst kravas veidu “${cargoType.name}”?`)) return;
    setMessage("");
    const { data, error } = await supabase.rpc("delete_cargo_type", {
      target_cargo_type_id: cargoType.id,
    });
    if (error || data !== true) {
      setMessage("Kravas veidu neizdevās dzēst.");
      return;
    }
    if (editingId === cargoType.id) clearForm();
    await loadCargoTypes();
    setMessage("Kravas veids izdzēsts.");
  }

  async function addSubtype(parentId: number, value = subtypeName) {
    if (!value.trim()) {
      setMessage("Ievadi tehnikas vienības nosaukumu.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("add_cargo_subtype", {
      target_parent_id: parentId,
      cargo_type_name: value,
    });
    setSaving(false);
    if (error) {
      setMessage(error.message.includes("duplicate") ? "Šāda tehnikas vienība jau pastāv." : "Tehnikas vienību neizdevās pievienot.");
      return;
    }
    if (value === subtypeName) setSubtypeName("");
    setWeightNames((current) => ({ ...current, [parentId]: "" }));
    await loadCargoTypes();
    setMessage("Tehnikas vienība pievienota.");
  }

  if (loading) return <p className="p-6">Ielādē...</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <div>
        <h1 className="text-2xl font-bold">Kravas veidi</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pārvaldi brauciena pieteikumā pieejamo kravas veidu sarakstu.
        </p>
      </div>

      {message && (
        <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">
          {message}
        </p>
      )}

      <section className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">
            {editingId ? "Rediģēt kravas veidu" : "Pievienot kravas veidu"}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={clearForm}
              className="flex items-center gap-1 text-sm text-zinc-500"
            >
              <X size={17} /> Atcelt
            </button>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void saveCargoType();
            }}
            placeholder="Piem., Beramkrava"
            maxLength={100}
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent p-2 dark:border-zinc-600"
          />
          <button
            type="button"
            onClick={() => void saveCargoType()}
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {editingId ? <Check size={18} /> : <Plus size={18} />}
            {saving ? "Saglabā..." : "Saglabāt"}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Saraksts ({cargoTypes.filter((item) => item.parent_id === null).length})</h2>
        {cargoTypes.filter((item) => item.parent_id === null).map((cargoType) => {
          const subtypes = cargoTypes.filter((item) => item.parent_id === cargoType.id);
          const expanded = expandedId === cargoType.id;
          return (
          <article
            key={cargoType.id}
            className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700"
          >
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => setExpandedId(expanded ? null : cargoType.id)} className="flex min-w-0 items-center gap-2 text-left font-medium">
                {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                <span className="truncate">{cargoType.name}</span>
                {subtypes.length > 0 && <span className="text-xs text-zinc-500">({subtypes.length})</span>}
              </button>
              <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingId(cargoType.id);
                  setName(cargoType.name);
                  setMessage("");
                }}
                className="rounded-lg border border-zinc-300 p-2 hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                aria-label={`Rediģēt ${cargoType.name}`}
              >
                <Pencil size={18} />
              </button>
              <button
                type="button"
                onClick={() => void deleteCargoType(cargoType)}
                className="rounded-lg bg-red-600 p-2 text-white hover:bg-red-700"
                aria-label={`Dzēst ${cargoType.name}`}
              >
                <Trash2 size={18} />
              </button>
              </div>
            </div>
            {expanded && (
              <div className="mt-4 space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
                {subtypes.map((subtype) => (
                  <div key={subtype.id} className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                    <div className="flex items-center justify-between gap-2"><span className="font-medium">{subtype.name}</span><div className="flex gap-1">
                      <button type="button" onClick={() => { setEditingId(subtype.id); setName(subtype.name); setMessage(""); }} className="rounded-md p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700" aria-label={`Rediģēt ${subtype.name}`}><Pencil size={16} /></button>
                      <button type="button" onClick={() => void deleteCargoType(subtype)} className="rounded-md p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950" aria-label={`Dzēst ${subtype.name}`}><Trash2 size={16} /></button>
                    </div></div>
                    <div className="mt-2 flex flex-wrap gap-2">{cargoTypes.filter((item) => item.parent_id === subtype.id).map((weight) => <span key={weight.id} className="inline-flex items-center gap-1 rounded-full border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600">{weight.name}<button type="button" onClick={() => void deleteCargoType(weight)} className="text-red-600" aria-label={`Dzēst ${weight.name}`}><X size={14} /></button></span>)}</div>
                    <div className="mt-2 flex gap-2"><input value={weightNames[subtype.id] || ""} onChange={(event) => setWeightNames((current) => ({ ...current, [subtype.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") void addSubtype(subtype.id, weightNames[subtype.id] || ""); }} placeholder="Piem., 3,5 t" maxLength={100} className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent p-2 text-sm dark:border-zinc-600" /><button type="button" onClick={() => void addSubtype(subtype.id, weightNames[subtype.id] || "")} className="rounded-lg border border-green-600 p-2 text-green-700" aria-label="Pievienot svaru"><Plus size={16} /></button></div>
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <input value={subtypeName} onChange={(event) => setSubtypeName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addSubtype(cargoType.id); }} placeholder="Piem., Frontālais iekrāvējs" maxLength={100} className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent p-2 text-sm dark:border-zinc-600" />
                  <button type="button" onClick={() => void addSubtype(cargoType.id)} disabled={saving} className="rounded-lg bg-green-600 p-2 text-white disabled:opacity-50" aria-label="Pievienot tehnikas vienību"><Plus size={18} /></button>
                </div>
              </div>
            )}
          </article>
        )})}
      </section>
    </div>
  );
}
