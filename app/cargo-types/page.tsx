"use client";

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type CargoType = {
  id: number;
  name: string;
};

export default function CargoTypesPage() {
  const router = useRouter();
  const [cargoTypes, setCargoTypes] = useState<CargoType[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadCargoTypes() {
    const { data, error } = await supabase
      .from("cargo_types")
      .select("id, name")
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
        .select("role")
        .eq("id", authData.user.id)
        .single();
      if (profile?.role !== "admin") {
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
        <h2 className="font-semibold">Saraksts ({cargoTypes.length})</h2>
        {cargoTypes.map((cargoType) => (
          <article
            key={cargoType.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700"
          >
            <span className="min-w-0 truncate font-medium">{cargoType.name}</span>
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
          </article>
        ))}
      </section>
    </div>
  );
}
