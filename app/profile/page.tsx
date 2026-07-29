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
    setSaving(false);
    if (error) return setMessage("Profila izmaiņas neizdevās saglabāt.");
    setAvatarUrl(nextAvatarUrl);
    setImage(null);
    setNewPassword("");
    setRepeatPassword("");
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
        <label className="block space-y-1">
          <span className="text-sm font-medium">E-pasts</span>
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Jaunā parole</span>
            <input
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Atstāj tukšu, ja nemaini"
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
              placeholder="Atkārto jauno paroli"
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
            />
          </label>
        </div>
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
