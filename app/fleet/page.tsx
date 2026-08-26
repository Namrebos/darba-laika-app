"use client";

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Vehicle = {
  id: number;
  registration_number: string;
  display_name: string;
  usage_count: number;
};

export default function FleetPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadVehicles() {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, registration_number, display_name, usage_count")
      .eq("is_active", true)
      .order("usage_count", { ascending: false })
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .order("registration_number");
    if (error) {
      setMessage("Auto sarakstu neizdevās ielādēt.");
      return;
    }
    setVehicles((data || []) as Vehicle[]);
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
        .select("role, can_access_planned_tasks")
        .eq("id", authData.user.id)
        .single();
      if (
        profile?.role !== "admin" &&
        profile?.can_access_planned_tasks !== true
      ) {
        router.replace("/summary");
        return;
      }
      await loadVehicles();
      setLoading(false);
    }
    void load();
  }, [router]);

  function clearForm() {
    setEditingId(null);
    setRegistrationNumber("");
    setDisplayName("");
  }

  async function saveVehicle() {
    if (!registrationNumber.trim() || !displayName.trim()) {
      setMessage("Ievadi auto nosaukumu un VNZ.");
      return;
    }
    const wasEditing = editingId !== null;
    setSaving(true);
    setMessage("");
    const { error } = editingId
      ? await supabase.rpc("update_vehicle", {
          target_vehicle_id: editingId,
          vehicle_registration_number: registrationNumber,
          vehicle_display_name: displayName,
        })
      : await supabase.rpc("add_vehicle", {
          vehicle_registration_number: registrationNumber,
          vehicle_display_name: displayName,
        });
    setSaving(false);
    if (error) {
      setMessage(error.message || "Auto neizdevās saglabāt.");
      return;
    }
    clearForm();
    await loadVehicles();
    setMessage(wasEditing ? "Auto izmaiņas saglabātas." : "Auto pievienots.");
  }

  function editVehicle(vehicle: Vehicle) {
    setEditingId(vehicle.id);
    setRegistrationNumber(vehicle.registration_number);
    setDisplayName(vehicle.display_name);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteVehicle(vehicle: Vehicle) {
    if (
      !window.confirm(
        `Vai tiešām dzēst “${vehicle.display_name}” (${vehicle.registration_number}) no autoparka?`,
      )
    ) {
      return;
    }
    setMessage("");
    const { error } = await supabase.rpc("archive_vehicle", {
      target_vehicle_id: vehicle.id,
    });
    if (error) {
      setMessage("Auto neizdevās dzēst.");
      return;
    }
    if (editingId === vehicle.id) clearForm();
    await loadVehicles();
    setMessage("Auto dzēsts no autoparka.");
  }

  if (loading) return <p className="p-6">Ielādē...</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <div>
        <h1 className="text-2xl font-bold">Autoparks</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pievieno un pārvaldi uzdevumos izmantojamos auto.
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
            {editingId ? "Rediģēt auto" : "Pievienot auto"}
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
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Auto nosaukums</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Piem., Volvo FH"
              className="w-full rounded-lg border border-zinc-300 bg-transparent p-2 dark:border-zinc-600"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">VNZ</span>
            <input
              value={registrationNumber}
              onChange={(event) =>
                setRegistrationNumber(event.target.value.toUpperCase())
              }
              placeholder="Piem., AB-1234"
              className="w-full rounded-lg border border-zinc-300 bg-transparent p-2 uppercase dark:border-zinc-600"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void saveVehicle()}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50 sm:w-auto"
        >
          {editingId ? <Check size={18} /> : <Plus size={18} />}
          {saving ? "Saglabā..." : editingId ? "Saglabāt izmaiņas" : "Pievienot"}
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Auto ({vehicles.length})</h2>
        {vehicles.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">
            Autoparkā vēl nav neviena auto.
          </p>
        ) : (
          vehicles.map((vehicle) => (
            <article
              key={vehicle.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700"
            >
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{vehicle.display_name}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  {vehicle.registration_number}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Izmantots {vehicle.usage_count}×
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => editVehicle(vehicle)}
                  className="rounded-lg border border-zinc-300 p-2 hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                  aria-label="Rediģēt auto"
                >
                  <Pencil size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => void deleteVehicle(vehicle)}
                  className="rounded-lg border border-red-300 p-2 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
                  aria-label="Dzēst auto"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
