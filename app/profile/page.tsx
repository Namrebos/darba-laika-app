"use client";

import { useEffect, useState } from "react";
import { BookOpenText } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import DictionaryModal from "@/app/components/DictionaryModal";
import UserAvatar from "@/app/components/UserAvatar";

type DictionaryWord = {
  name: string;
  usageCount: number;
};

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
        setRegularWorkStart(workSchedule.regular_start.slice(0, 5));
        setRegularWorkEnd(workSchedule.regular_end.slice(0, 5));
      }
      await loadDictionary(authData.user.id);
    }
    load();
  }, []);

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
    if (!regularWorkStart || !regularWorkEnd) {
      return setMessage("Norādi parastās darba dienas sākumu un beigas.");
    }
    if (regularWorkEnd <= regularWorkStart) {
      return setMessage("Darba dienas beigām jābūt pēc sākuma laika.");
    }
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
    const { error: scheduleError } = await supabase
      .from("user_work_schedule_settings")
      .upsert({
        user_id: userId,
        regular_start: regularWorkStart,
        regular_end: regularWorkEnd,
        updated_at: new Date().toISOString(),
      });
    setSaving(false);
    if (scheduleError) {
      return setMessage("Darba laika robežas neizdevās saglabāt.");
    }
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
            <h2 className="font-semibold">Parastais darba laiks</h2>
            <p className="text-sm text-zinc-500">
              Darbs ārpus šīm robežām tiek skaitīts kā virsstundas. Sestdienās un svētdienās viss darba laiks ir virsstundas.
            </p>
          </div>
          <div className="flex flex-nowrap items-center gap-2">
            <label className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-sm font-medium">No</span>
              <input
                required
                type="time"
                step={900}
                value={regularWorkStart}
                onChange={(event) => setRegularWorkStart(event.target.value)}
                aria-label="Darba dienas sākums"
                className="w-[6.5rem] min-w-0 rounded border border-zinc-300 bg-white px-2 py-2 dark:border-zinc-600 dark:bg-zinc-800"
              />
            </label>
            <span aria-hidden="true" className="text-zinc-400">–</span>
            <label className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-sm font-medium">līdz</span>
              <input
                required
                type="time"
                step={900}
                value={regularWorkEnd}
                onChange={(event) => setRegularWorkEnd(event.target.value)}
                aria-label="Darba dienas beigas"
                className="w-[6.5rem] min-w-0 rounded border border-zinc-300 bg-white px-2 py-2 dark:border-zinc-600 dark:bg-zinc-800"
              />
            </label>
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
