"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import UserAvatar from "@/app/components/UserAvatar";

export default function ProfilePage() {
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;
      setUserId(authData.user.id);
      const { data } = await supabase
        .from("profiles")
        .select("email, display_name, avatar_url")
        .eq("id", authData.user.id)
        .single();
      if (data) {
        setEmail(data.email || "");
        setDisplayName(data.display_name || "");
        setAvatarUrl(data.avatar_url);
      }
    }
    load();
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const name = displayName.trim();
    if (!name) return setMessage("Ievadi vārdu vai lietotājvārdu.");
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

    const { error } = await supabase.rpc("update_own_profile", {
      new_display_name: name,
      new_avatar_url: nextAvatarUrl,
    });
    setSaving(false);
    if (error) return setMessage("Profila izmaiņas neizdevās saglabāt.");
    setAvatarUrl(nextAvatarUrl);
    setImage(null);
    setMessage("Profils saglabāts.");
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
          <input disabled value={email} className="w-full rounded border border-zinc-300 bg-zinc-100 px-3 py-2 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900" />
        </label>
        <button disabled={saving} className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50">
          {saving ? "Saglabā..." : "Saglabāt"}
        </button>
      </form>
    </div>
  );
}
