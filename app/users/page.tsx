"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { AccessProfile, AppRole } from "@/lib/access";

const roleLabels: Record<AppRole, string> = {
  admin: "Administrators",
  member: "Datu ievadītājs",
  viewer: "Tikai kopsavilkums",
};

export default function UsersPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [adminId, setAdminId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [inviteRole, setInviteRole] = useState<Exclude<AppRole, "admin">>("viewer");
  const [invitationLink, setInvitationLink] = useState("");
  const [creatingInvitation, setCreatingInvitation] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace("/login");
        return;
      }

      const { data: ownProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single();

      if (ownProfile?.role !== "admin") {
        router.replace("/summary");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, role, data_owner_id")
        .order("created_at", { ascending: true });

      if (error) setMessage("Neizdevās ielādēt lietotājus.");
      const rows = (data || []) as AccessProfile[];
      setProfiles(rows);
      setAdminId(rows.find((profile) => profile.role === "admin")?.id || authData.user.id);
      setLoading(false);
    }

    load();
  }, [router]);

  async function changeRole(profile: AccessProfile, role: AppRole) {
    const dataOwnerId = role === "viewer" ? adminId : profile.id;
    const { error } = await supabase
      .from("profiles")
      .update({ role, data_owner_id: dataOwnerId })
      .eq("id", profile.id);

    if (error) {
      setMessage("Lomu neizdevās saglabāt.");
      return;
    }

    setProfiles((current) =>
      current.map((item) =>
        item.id === profile.id
          ? { ...item, role, data_owner_id: dataOwnerId }
          : item,
      ),
    );
    setMessage("Loma saglabāta.");
  }

  async function createInvitation(event: React.FormEvent) {
    event.preventDefault();
    setCreatingInvitation(true);
    setMessage("");
    setInvitationLink("");

    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch("/api/admin/invitations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
      },
      body: JSON.stringify({ role: inviteRole }),
    });
    const result = (await response.json()) as {
      invitationLink?: string;
      error?: string;
    };

    setCreatingInvitation(false);
    if (!response.ok || !result.invitationLink) {
      setMessage(result.error || "Uzaicinājumu neizdevās izveidot.");
      return;
    }

    setInvitationLink(result.invitationLink);
    setMessage("Uzaicinājums izveidots. Nokopē saiti un nosūti lietotājam.");
  }

  async function copyInvitation() {
    await navigator.clipboard.writeText(invitationLink);
    setMessage("Uzaicinājuma saite nokopēta.");
  }

  if (loading) return <p className="p-6">Ielādē...</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <div>
        <h1 className="text-2xl font-bold">Lietotāji</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Izveido personīgu reģistrācijas saiti un nosūti to jaunajam lietotājam.
        </p>
      </div>

      {message && <p className="rounded bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">{message}</p>}

      <form onSubmit={createInvitation} className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <h2 className="font-semibold">Jauns uzaicinājums</h2>
        <p className="text-sm text-zinc-500">Izvēlies lomu. Lietotājs e-pastu un paroli ievadīs pats.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value as Exclude<AppRole, "admin">)}
            className="rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
          >
            <option value="viewer">Tikai kopsavilkums</option>
            <option value="member">Datu ievadītājs</option>
          </select>
          <button disabled={creatingInvitation} className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50">
            {creatingInvitation ? "Veido..." : "Izveidot saiti"}
          </button>
        </div>
        {invitationLink && (
          <div className="flex gap-2">
            <input readOnly value={invitationLink} className="min-w-0 flex-1 rounded border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900" />
            <button type="button" onClick={copyInvitation} className="rounded bg-zinc-700 px-4 py-2 text-white">Kopēt</button>
          </div>
        )}
      </form>

      <div className="space-y-3">
        {profiles.map((profile) => (
          <div key={profile.id} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{profile.email || profile.id}</p>
              <p className="text-xs text-zinc-500">{roleLabels[profile.role]}</p>
            </div>
            <select
              value={profile.role}
              disabled={profile.id === adminId}
              onChange={(event) => changeRole(profile, event.target.value as AppRole)}
              className="rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
            >
              <option value="member">Datu ievadītājs</option>
              <option value="viewer">Tikai kopsavilkums</option>
              {profile.id === adminId && <option value="admin">Administrators</option>}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
