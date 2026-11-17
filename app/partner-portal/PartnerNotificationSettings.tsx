"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Preferences = {
  enabled: boolean;
  partner_all_status_changes: boolean;
  partner_status_sent: boolean;
  partner_status_planned: boolean;
  partner_status_started: boolean;
  partner_status_completed: boolean;
  partner_status_canceled: boolean;
};

const DEFAULTS: Preferences = {
  enabled: false,
  partner_all_status_changes: true,
  partner_status_sent: true,
  partner_status_planned: true,
  partner_status_started: true,
  partner_status_completed: true,
  partner_status_canceled: true,
};

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export default function PartnerNotificationSettings({
  authorizedFetch,
}: {
  authorizedFetch: (url: string, init?: RequestInit) => Promise<Response | null>;
}) {
  const [preferences, setPreferences] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const response = await authorizedFetch("/api/partner-portal/notifications");
      const result = response ? await response.json() as { preferences?: Preferences; error?: string } : {};
      if (!active) return;
      if (response?.ok && result.preferences) setPreferences(result.preferences);
      else setMessage(result.error || "Paziņojumu iestatījumus neizdevās ielādēt.");
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [authorizedFetch]);

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  async function connectPush() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      throw new Error("Šī ierīce vai pārlūks neatbalsta push paziņojumus.");
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Atļauj paziņojumus ierīces vai pārlūka iestatījumos.");
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const keyResponse = await fetch("/api/notifications/vapid-key");
      const keyResult = await keyResponse.json() as { publicKey?: string };
      if (!keyResponse.ok || !keyResult.publicKey) throw new Error("Paziņojumu atslēga nav pieejama.");
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyResult.publicKey),
      });
    }
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/notifications/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!response.ok) throw new Error("Ierīci neizdevās pieslēgt paziņojumiem.");
  }

  async function disconnectPush() {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const { data } = await supabase.auth.getSession();
    await fetch("/api/notifications/subscription", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      if (preferences.enabled) await connectPush();
      else await disconnectPush();
      const response = await authorizedFetch("/api/partner-portal/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });
      const result = response ? await response.json() as { error?: string } : {};
      if (!response?.ok) throw new Error(result.error || "Iestatījumus neizdevās saglabāt.");
      setMessage(preferences.enabled ? "Paziņojumu iestatījumi saglabāti." : "Paziņojumi izslēgti.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Paziņojumu iestatījumus neizdevās saglabāt.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-800">Ielādē paziņojumu iestatījumus...</section>;

  const statusOptions = [
    ["partner_status_sent", "Pieteikums nosūtīts"],
    ["partner_status_planned", "Brauciens ieplānots"],
    ["partner_status_started", "Brauciens sākts"],
    ["partner_status_completed", "Brauciens pabeigts"],
    ["partner_status_canceled", "Brauciens atcelts"],
  ] as const;

  return (
    <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-800">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          {preferences.enabled ? <Bell className="mt-0.5 text-blue-600" size={22} /> : <BellOff className="mt-0.5 text-zinc-500" size={22} />}
          <div><h2 className="font-bold">Paziņojumi</h2><p className="text-sm text-slate-500">Izvēlies, par kurām brauciena statusa izmaiņām saņemt paziņojumu.</p></div>
        </div>
        <label className="relative inline-flex shrink-0 cursor-pointer items-center">
          <input type="checkbox" checked={preferences.enabled} onChange={(event) => update("enabled", event.target.checked)} className="peer sr-only" />
          <span className="h-6 w-11 rounded-full bg-zinc-300 transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:bg-blue-600 peer-checked:after:translate-x-5 dark:bg-zinc-600" />
        </label>
      </div>
      <div className={`space-y-3 ${preferences.enabled ? "" : "pointer-events-none opacity-45"}`}>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-zinc-700">
          <strong>Visas statusa izmaiņas</strong>
          <input type="checkbox" checked={preferences.partner_all_status_changes} onChange={(event) => update("partner_all_status_changes", event.target.checked)} className="h-5 w-5 accent-blue-600" />
        </label>
        <div className={`space-y-2 ${preferences.partner_all_status_changes ? "pointer-events-none opacity-45" : ""}`}>
          {statusOptions.map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-zinc-700">
              <span>{label}</span>
              <input type="checkbox" checked={preferences[key]} onChange={(event) => update(key, event.target.checked)} className="h-5 w-5 accent-blue-600" />
            </label>
          ))}
        </div>
      </div>
      {message && <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">{message}</p>}
      <button type="button" disabled={saving} onClick={() => void save()} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
        {saving ? "Saglabā..." : "Saglabāt paziņojumu iestatījumus"}
      </button>
    </section>
  );
}
