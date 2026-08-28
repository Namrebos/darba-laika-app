"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, BookOpenText, ChevronDown, Clock, Moon } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import DictionaryModal from "@/app/components/DictionaryModal";
import UserAvatar from "@/app/components/UserAvatar";

type DictionaryWord = {
  name: string;
  usageCount: number;
};

type NotificationPreferences = {
  enabled: boolean;
  new_requests: boolean;
  assigned_tasks: boolean;
  task_changes: boolean;
  task_cancellations: boolean;
  work_start_reminders: boolean;
  work_end_reminders: boolean;
  work_start_reminder_time: string;
  work_end_reminder_time: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
};

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: false,
  new_requests: true,
  assigned_tasks: true,
  task_changes: true,
  task_cancellations: true,
  work_start_reminders: false,
  work_end_reminders: false,
  work_start_reminder_time: "08:45",
  work_end_reminder_time: "18:00",
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
};

const WORK_TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
});

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export default function ProfilePage() {
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [originalEmail, setOriginalEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [dictionaryWords, setDictionaryWords] = useState<DictionaryWord[]>([]);
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [regularWorkStart, setRegularWorkStart] = useState("09:00");
  const [regularWorkEnd, setRegularWorkEnd] = useState("18:00");
  const [draftWorkStart, setDraftWorkStart] = useState("09:00");
  const [draftWorkEnd, setDraftWorkEnd] = useState("18:00");
  const [workTimeOpen, setWorkTimeOpen] = useState(false);
  const [savingWorkTime, setSavingWorkTime] = useState(false);
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const workTimePickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function load() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;
      setUserId(authData.user.id);
      const authEmail = authData.user.email || "";
      setEmail(authEmail);
      setOriginalEmail(authEmail);
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", authData.user.id)
        .single();
      if (data) {
        setDisplayName(data.display_name || "");
        setAvatarUrl(data.avatar_url);
      }
      const { data: workSchedule } = await supabase
        .from("user_work_schedule_settings")
        .select("regular_start, regular_end")
        .eq("user_id", authData.user.id)
        .maybeSingle();
      if (workSchedule) {
        const start = workSchedule.regular_start.slice(0, 5);
        const end = workSchedule.regular_end.slice(0, 5);
        setRegularWorkStart(start);
        setRegularWorkEnd(end);
        setDraftWorkStart(start);
        setDraftWorkEnd(end);
      }
      const { data: savedNotificationPreferences } = await supabase
        .from("notification_preferences")
        .select(
          "enabled, new_requests, assigned_tasks, task_changes, task_cancellations, work_start_reminders, work_end_reminders, work_start_reminder_time, work_end_reminder_time, quiet_hours_enabled, quiet_hours_start, quiet_hours_end",
        )
        .eq("user_id", authData.user.id)
        .maybeSingle();
      if (savedNotificationPreferences) {
        setNotificationPreferences({
          ...savedNotificationPreferences,
          quiet_hours_start: savedNotificationPreferences.quiet_hours_start.slice(0, 5),
          quiet_hours_end: savedNotificationPreferences.quiet_hours_end.slice(0, 5),
          work_start_reminder_time: savedNotificationPreferences.work_start_reminder_time.slice(0, 5),
          work_end_reminder_time: savedNotificationPreferences.work_end_reminder_time.slice(0, 5),
        });
      }
      await loadDictionary(authData.user.id);
    }
    load();
  }, []);

  useEffect(() => {
    function closeWorkTimePicker(event: MouseEvent) {
      if (
        workTimePickerRef.current &&
        !workTimePickerRef.current.contains(event.target as Node)
      ) {
        setWorkTimeOpen(false);
        setDraftWorkStart(regularWorkStart);
        setDraftWorkEnd(regularWorkEnd);
      }
    }
    document.addEventListener("mousedown", closeWorkTimePicker);
    return () => document.removeEventListener("mousedown", closeWorkTimePicker);
  }, [regularWorkEnd, regularWorkStart]);

  async function loadDictionary(id: string) {
    const { data } = await supabase
      .from("tags")
      .select("name, usage_count")
      .eq("user_id", id)
      .order("usage_count", { ascending: false });
    setDictionaryWords(
      (data || []).map((word) => ({
        name: word.name,
        usageCount: word.usage_count || 0,
      })),
    );
  }

  async function addDictionaryWord(word: string) {
    const clean = word.trim().replace(/^#+/, "").replace(/\s+/g, "_");
    if (!clean || !userId) return;
    const existing = dictionaryWords.find(
      (item) => item.name.toLowerCase() === clean.toLowerCase(),
    );
    const { error } = existing
      ? await supabase
          .from("tags")
          .update({ usage_count: existing.usageCount + 1 })
          .eq("user_id", userId)
          .eq("name", existing.name)
      : await supabase
          .from("tags")
          .insert({ user_id: userId, name: clean, usage_count: 1 });
    if (error) {
      setMessage("Vārdu neizdevās saglabāt vārdnīcā.");
      return;
    }
    await loadDictionary(userId);
  }

  async function deleteDictionaryWords(words: string[]) {
    if (!userId || words.length === 0) return;
    const { error } = await supabase
      .from("tags")
      .delete()
      .eq("user_id", userId)
      .in("name", words);
    if (error) {
      setMessage("Vārdus neizdevās izdzēst.");
      return;
    }
    await loadDictionary(userId);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const name = displayName.trim();
    const nextEmail = email.trim().toLowerCase();
    if (!name) return setMessage("Ievadi vārdu vai lietotājvārdu.");
    if (!nextEmail) return setMessage("Ievadi e-pasta adresi.");
    if (newPassword && newPassword.length < 8) {
      return setMessage("Jaunajai parolei jābūt vismaz 8 rakstzīmes garai.");
    }
    if (newPassword !== repeatPassword) {
      return setMessage("Ievadītās paroles nesakrīt.");
    }
    setSaving(true);
    setMessage("");
    let nextAvatarUrl = avatarUrl;

    if (image) {
      const extension = image.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/avatar-${Date.now()}.${extension}`;
      const { data: oldFiles } = await supabase.storage.from("profile-images").list(userId);
      if (oldFiles?.length) {
        await supabase.storage.from("profile-images").remove(oldFiles.map((file) => `${userId}/${file.name}`));
      }
      const { error: uploadError } = await supabase.storage
        .from("profile-images")
        .upload(path, image, { contentType: image.type });
      if (uploadError) {
        setSaving(false);
        return setMessage("Profila attēlu neizdevās augšupielādēt.");
      }
      nextAvatarUrl = supabase.storage.from("profile-images").getPublicUrl(path).data.publicUrl;
    }

    const emailChanged = nextEmail !== originalEmail.toLowerCase();
    if (emailChanged || newPassword) {
      const { error: authError } = await supabase.auth.updateUser({
        ...(emailChanged ? { email: nextEmail } : {}),
        ...(newPassword ? { password: newPassword } : {}),
      });
      if (authError) {
        setSaving(false);
        return setMessage(`Piekļuves datus neizdevās mainīt: ${authError.message}`);
      }
    }

    const { error } = await supabase.rpc("update_own_profile", {
      new_display_name: name,
      new_avatar_url: nextAvatarUrl,
    });
    if (error) {
      setSaving(false);
      return setMessage("Profila izmaiņas neizdevās saglabāt.");
    }
    setSaving(false);
    setAvatarUrl(nextAvatarUrl);
    setImage(null);
    setNewPassword("");
    setRepeatPassword("");
    setChangingPassword(false);
    if (emailChanged) {
      setEmail(originalEmail);
      setEditingEmail(false);
    }
    setMessage(
      emailChanged
        ? "Profils saglabāts. Apstiprini e-pasta maiņu saitē, kas nosūtīta uz e-pastu."
        : newPassword
          ? "Profils un jaunā parole saglabāti."
          : "Profils saglabāts.",
    );
  }

  async function confirmWorkTime() {
    const start = draftWorkStart;
    const end = draftWorkEnd;
    if (end <= start) {
      setMessage("Darba laika beigām jābūt pēc sākuma laika.");
      return;
    }
    if (!userId) {
      setMessage("Lietotāja sesija nav pieejama.");
      return;
    }

    setSavingWorkTime(true);
    setMessage("");
    const confirmedAt = new Date();
    const { error } = await supabase
      .from("user_work_schedule_settings")
      .upsert({
        user_id: userId,
        regular_start: start,
        regular_end: end,
        updated_at: confirmedAt.toISOString(),
      });
    setSavingWorkTime(false);
    if (error) {
      setMessage("Darba laiku neizdevās apstiprināt.");
      return;
    }

    setRegularWorkStart(start);
    setRegularWorkEnd(end);
    setWorkTimeOpen(false);
    setMessage(
      `Darba laiks ${start}–${end} darbojas no apstiprināšanas brīža.`,
    );
  }

  async function saveNotificationPreferences() {
    if (!userId) {
      setMessage("Lietotāja sesija nav pieejama.");
      return;
    }
    setSavingNotifications(true);
    setMessage("");

    if (notificationPreferences.enabled) {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        setSavingNotifications(false);
        setMessage("Šī ierīce vai pārlūks neatbalsta push paziņojumus.");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setSavingNotifications(false);
        setMessage("Lai ieslēgtu paziņojumus, atļauj tos ierīces iestatījumos.");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          const response = await fetch("/api/notifications/vapid-key");
          const payload = (await response.json()) as { publicKey?: string };
          if (!response.ok || !payload.publicKey) throw new Error("Missing VAPID key");
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(payload.publicKey),
          });
        }
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("Missing session");
        const response = await fetch("/api/notifications/subscription", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(subscription.toJSON()),
        });
        if (!response.ok) throw new Error("Subscription failed");
      } catch {
        setSavingNotifications(false);
        setMessage("Ierīci neizdevās pieslēgt paziņojumiem.");
        return;
      }
    } else if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const { data: sessionData } = await supabase.auth.getSession();
        await fetch("/api/notifications/subscription", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
    }

    const { error } = await supabase.from("notification_preferences").upsert({
      user_id: userId,
      ...notificationPreferences,
      updated_at: new Date().toISOString(),
    });
    setSavingNotifications(false);
    setMessage(
      error
        ? "Paziņojumu iestatījumus neizdevās saglabāt."
        : notificationPreferences.enabled
          ? "Paziņojumu iestatījumi saglabāti."
          : "Paziņojumi ir izslēgti.",
    );
  }

  const updateNotificationPreference = <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K],
  ) => {
    setNotificationPreferences((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4">
      <div>
        <h1 className="text-2xl font-bold">Profils</h1>
        <p className="mt-1 text-sm text-zinc-500">Pārvaldi savu publisko lietotāja informāciju.</p>
      </div>
      {message && <p className="rounded bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">{message}</p>}
      <form onSubmit={save} className="space-y-5 rounded-lg border border-zinc-200 p-5 dark:border-zinc-700">
        <div className="flex items-center gap-4">
          <UserAvatar name={displayName || "?"} avatarUrl={image ? URL.createObjectURL(image) : avatarUrl} size="lg" />
          <label className="cursor-pointer rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600">
            Izvēlēties attēlu
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => setImage(event.target.files?.[0] || null)} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Vārds vai lietotājvārds</span>
          <input required maxLength={50} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800" />
        </label>
        <div className="space-y-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <div>
            <h2 className="font-semibold">Darba laiks</h2>
            <p className="text-sm text-zinc-500">
              Darbs ārpus šīm robežām tiek skaitīts kā virsstundas. Sestdienās un svētdienās viss darba laiks ir virsstundas.
            </p>
          </div>
          <div ref={workTimePickerRef} className="relative">
            <button
              type="button"
              onClick={() => setWorkTimeOpen((open) => !open)}
              className="flex w-full items-center gap-3 rounded border border-zinc-300 bg-white px-3 py-2 text-left dark:border-zinc-600 dark:bg-zinc-800"
              aria-expanded={workTimeOpen}
            >
              <Clock size={18} className="shrink-0 text-blue-600" />
              <span className="flex-1 font-medium">
                {draftWorkStart}–{draftWorkEnd}
              </span>
              <ChevronDown
                size={18}
                className={`transition ${workTimeOpen ? "rotate-180" : ""}`}
              />
            </button>

            {workTimeOpen && (
              <div className="absolute left-0 right-0 z-20 mt-2 space-y-3 rounded-lg border border-zinc-300 bg-white p-3 shadow-xl dark:border-zinc-600 dark:bg-zinc-900">
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                  <label className="space-y-1">
                    <span className="text-xs font-medium">No</span>
                    <select
                      value={draftWorkStart}
                      onChange={(event) => setDraftWorkStart(event.target.value)}
                      className="w-full rounded border border-zinc-300 bg-white px-2 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                    >
                      {WORK_TIME_OPTIONS.map((time) => (
                        <option key={`start-${time}`} value={time}>{time}</option>
                      ))}
                    </select>
                  </label>
                  <span className="pb-2 text-zinc-400">–</span>
                  <label className="space-y-1">
                    <span className="text-xs font-medium">Līdz</span>
                    <select
                      value={draftWorkEnd}
                      onChange={(event) => setDraftWorkEnd(event.target.value)}
                      className="w-full rounded border border-zinc-300 bg-white px-2 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                    >
                      {WORK_TIME_OPTIONS.map((time) => (
                        <option key={`end-${time}`} value={time}>{time}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  disabled={
                    savingWorkTime ||
                    (draftWorkStart === regularWorkStart &&
                      draftWorkEnd === regularWorkEnd)
                  }
                  onClick={() => void confirmWorkTime()}
                  className="w-full rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingWorkTime ? "Apstiprina..." : "Apstiprināt"}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <span className="text-sm font-medium">E-pasts</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              required
              disabled={!editingEmail}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-3 py-2 disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:disabled:bg-zinc-900"
            />
            {editingEmail ? (
              <button
                type="button"
                onClick={() => {
                  setEmail(originalEmail);
                  setEditingEmail(false);
                }}
                className="rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              >
                Atcelt
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEditingEmail(true)}
                className="rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              >
                Mainīt e-pastu
              </button>
            )}
          </div>
        </div>
        {changingPassword ? (
          <div className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm font-medium">Jaunā parole</span>
                <input
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Atkārtot jauno paroli</span>
                <input
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  value={repeatPassword}
                  onChange={(event) => setRepeatPassword(event.target.value)}
                  className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => {
                setNewPassword("");
                setRepeatPassword("");
                setChangingPassword(false);
              }}
              className="rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
            >
              Atcelt paroles maiņu
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setChangingPassword(true)}
            className="rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
          >
            Mainīt paroli
          </button>
        )}
        <div className="flex flex-wrap gap-3">
          <button disabled={saving} className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50">
            {saving ? "Saglabā..." : "Saglabāt"}
          </button>
          <button
            type="button"
            onClick={() => setDictionaryOpen(true)}
            className="inline-flex items-center gap-2 rounded bg-cyan-600 px-4 py-2 font-medium text-white hover:bg-cyan-700"
          >
            <BookOpenText size={18} />
            Vārdnīca
          </button>
        </div>
      </form>
      <section className="space-y-4 rounded-lg border border-zinc-200 p-5 dark:border-zinc-700">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            {notificationPreferences.enabled ? (
              <Bell className="mt-0.5 shrink-0 text-blue-600" size={22} />
            ) : (
              <BellOff className="mt-0.5 shrink-0 text-zinc-500" size={22} />
            )}
            <div>
              <h2 className="font-semibold">Paziņojumi</h2>
              <p className="text-sm text-zinc-500">
                Pēc noklusējuma paziņojumi ir izslēgti. Izvēlies, kurus vēlies saņemt.
              </p>
            </div>
          </div>
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              checked={notificationPreferences.enabled}
              onChange={(event) =>
                updateNotificationPreference("enabled", event.target.checked)
              }
              className="peer sr-only"
            />
            <span className="h-6 w-11 rounded-full bg-zinc-300 transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:bg-blue-600 peer-checked:after:translate-x-5 dark:bg-zinc-600" />
          </label>
        </div>

        <div className={`space-y-3 ${notificationPreferences.enabled ? "" : "pointer-events-none opacity-45"}`}>
          {([
            ["new_requests", "Jauns klienta brauciena pieteikums"],
            ["assigned_tasks", "Man piešķirts jauns uzdevums vai brauciens"],
            ["task_changes", "Izmaiņas man piešķirtā uzdevumā"],
            ["task_cancellations", "Uzdevums atcelts vai atjaunots"],
            ["work_start_reminders", "Darba laika sākuma atgādinājums"],
            ["work_end_reminders", "Darba laika beigu atgādinājums"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 rounded border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={notificationPreferences[key]}
                onChange={(event) =>
                  updateNotificationPreference(key, event.target.checked)
                }
                className="h-5 w-5 shrink-0 accent-blue-600"
              />
            </label>
          ))}

          {(notificationPreferences.work_start_reminders ||
            notificationPreferences.work_end_reminders) && (
            <div className="grid gap-3 rounded border border-zinc-200 p-3 sm:grid-cols-2 dark:border-zinc-700">
              {notificationPreferences.work_start_reminders && (
                <label className="space-y-1">
                  <span className="text-xs font-medium">Darba sākuma atgādinājums</span>
                  <input
                    type="time"
                    value={notificationPreferences.work_start_reminder_time}
                    onChange={(event) =>
                      updateNotificationPreference(
                        "work_start_reminder_time",
                        event.target.value,
                      )
                    }
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                  />
                </label>
              )}
              {notificationPreferences.work_end_reminders && (
                <label className="space-y-1">
                  <span className="text-xs font-medium">Darba beigu atgādinājums</span>
                  <input
                    type="time"
                    value={notificationPreferences.work_end_reminder_time}
                    onChange={(event) =>
                      updateNotificationPreference(
                        "work_end_reminder_time",
                        event.target.value,
                      )
                    }
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                  />
                </label>
              )}
            </div>
          )}

          <div className="space-y-3 rounded border border-zinc-200 p-3 dark:border-zinc-700">
            <label className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Moon size={17} className="text-indigo-500" />
                Klusuma laiks
              </span>
              <input
                type="checkbox"
                checked={notificationPreferences.quiet_hours_enabled}
                onChange={(event) =>
                  updateNotificationPreference(
                    "quiet_hours_enabled",
                    event.target.checked,
                  )
                }
                className="h-5 w-5 accent-blue-600"
              />
            </label>
            {notificationPreferences.quiet_hours_enabled && (
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium">No</span>
                  <input
                    type="time"
                    value={notificationPreferences.quiet_hours_start}
                    onChange={(event) =>
                      updateNotificationPreference(
                        "quiet_hours_start",
                        event.target.value,
                      )
                    }
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                  />
                </label>
                <span className="pb-2 text-zinc-400">–</span>
                <label className="space-y-1">
                  <span className="text-xs font-medium">Līdz</span>
                  <input
                    type="time"
                    value={notificationPreferences.quiet_hours_end}
                    onChange={(event) =>
                      updateNotificationPreference(
                        "quiet_hours_end",
                        event.target.value,
                      )
                    }
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={savingNotifications}
          onClick={() => void saveNotificationPreferences()}
          className="w-full rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {savingNotifications ? "Saglabā..." : "Saglabāt paziņojumu iestatījumus"}
        </button>
      </section>
      <DictionaryModal
        open={dictionaryOpen}
        onClose={() => setDictionaryOpen(false)}
        words={dictionaryWords}
        onAddWord={addDictionaryWord}
        onDeleteWords={deleteDictionaryWords}
      />
    </div>
  );
}
