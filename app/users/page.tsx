"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { AccessProfile, AppRole } from "@/lib/access";
import UserAvatar from "@/app/components/UserAvatar";

const roleLabels: Record<AppRole, string> = {
  admin: "Administrators",
  member: "Datu ievadītājs",
  viewer: "Tikai kopsavilkums",
};

export default function UsersPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [summaryAccess, setSummaryAccess] = useState<Record<string, string[]>>({});
  const [adminId, setAdminId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [inviteRole, setInviteRole] = useState<Exclude<AppRole, "admin">>("viewer");
  const [invitationLink, setInvitationLink] = useState("");
  const [creatingInvitation, setCreatingInvitation] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState("");

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

      const [{ data, error }, { data: accessRows }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, display_name, avatar_url, role, data_owner_id")
          .order("created_at", { ascending: true }),
        supabase.from("summary_access").select("viewer_id, owner_id"),
      ]);

      if (error) setMessage("Neizdevās ielādēt lietotājus.");
      const rows = (data || []) as AccessProfile[];
      setProfiles(rows);
      const accessMap: Record<string, string[]> = {};
      (accessRows || []).forEach(({ viewer_id, owner_id }) => {
        if (!accessMap[viewer_id]) accessMap[viewer_id] = [];
        accessMap[viewer_id].push(owner_id);
      });
      setSummaryAccess(accessMap);
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
    if (role === "viewer" && !(summaryAccess[profile.id] || []).length) {
      await supabase.from("summary_access").insert({
        viewer_id: profile.id,
        owner_id: adminId,
      });
      setSummaryAccess((current) => ({
        ...current,
        [profile.id]: [adminId],
      }));
    } else if (role !== "viewer") {
      await supabase.from("summary_access").delete().eq("viewer_id", profile.id);
      setSummaryAccess((current) => ({ ...current, [profile.id]: [] }));
    }
    setMessage("Loma saglabāta.");
  }

  async function toggleSummaryAccess(viewerId: string, ownerId: string, allowed: boolean) {
    const request = allowed
      ? supabase.from("summary_access").insert({ viewer_id: viewerId, owner_id: ownerId })
      : supabase.from("summary_access").delete().eq("viewer_id", viewerId).eq("owner_id", ownerId);
    const { error } = await request;
    if (error) {
      setMessage("Kopsavilkuma piekļuvi neizdevās saglabāt.");
      return;
    }

    setSummaryAccess((current) => ({
      ...current,
      [viewerId]: allowed
        ? [...(current[viewerId] || []), ownerId]
        : (current[viewerId] || []).filter((id) => id !== ownerId),
    }));
    setMessage("Kopsavilkuma piekļuve saglabāta.");
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
    try {
      await navigator.clipboard.writeText(invitationLink);
      setCopiedToast(true);
      window.setTimeout(() => setCopiedToast(false), 2500);
    } catch {
      setMessage("Saiti neizdevās nokopēt.");
    }
  }

  async function deleteUser(profile: AccessProfile) {
    if (profile.id === adminId) return;
    const confirmed = window.confirm(
      `Vai tiešām dzēst lietotāju ${profile.display_name || profile.email || profile.id}? Šo darbību nevarēs atcelt.`,
    );
    if (!confirmed) return;

    setDeletingUserId(profile.id);
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch(`/api/admin/users/${profile.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
      },
    });
    const result = (await response.json()) as { error?: string };
    setDeletingUserId("");

    if (!response.ok) {
      setMessage(result.error || "Lietotāju neizdevās dzēst.");
      return;
    }

    setProfiles((current) => current.filter((item) => item.id !== profile.id));
    setSummaryAccess((current) => {
      const next = { ...current };
      delete next[profile.id];
      Object.keys(next).forEach((viewerId) => {
        next[viewerId] = next[viewerId].filter((ownerId) => ownerId !== profile.id);
      });
      return next;
    });
    setMessage("Lietotājs izdzēsts.");
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
          <div key={profile.id} className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <UserAvatar name={profile.display_name} avatarUrl={profile.avatar_url} />
                <div>
                  <p className="font-medium">{profile.display_name}</p>
                  <p className="text-xs text-zinc-500">{profile.email || profile.id}</p>
                  <p className="text-xs text-zinc-500">{roleLabels[profile.role]}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
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
                {profile.id !== adminId && (
                  <button
                    type="button"
                    disabled={deletingUserId === profile.id}
                    onClick={() => deleteUser(profile)}
                    className="rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                  >
                    {deletingUserId === profile.id ? "Dzēš..." : "Dzēst"}
                  </button>
                )}
              </div>
            </div>

            {profile.role === "viewer" && (
              <div className="border-t border-zinc-200 pt-3 dark:border-zinc-700">
                <p className="mb-2 text-sm font-semibold">Drīkst skatīt kopsavilkumus:</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {profiles.filter((owner) => owner.role !== "viewer").map((owner) => (
                    <label key={owner.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={(summaryAccess[profile.id] || []).includes(owner.id)}
                        onChange={(event) => toggleSummaryAccess(profile.id, owner.id, event.target.checked)}
                      />
                      <span>{owner.display_name || owner.email || owner.id}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {copiedToast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-zinc-900">
          Saite nokopēta
        </div>
      )}
    </div>
  );
}
