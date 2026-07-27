"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type {
  AccessProfile,
  SectionAccessKey,
  SectionPermissions,
} from "@/lib/access";
import UserAvatar from "@/app/components/UserAvatar";

const sectionOptions: { key: SectionAccessKey; label: string }[] = [
  { key: "can_access_workday", label: "Darbadiena" },
  { key: "can_access_finance", label: "Finanses" },
  { key: "can_access_calculators", label: "Kalkulatori" },
  { key: "can_access_planned_tasks", label: "Plānotie uzdevumi" },
];

const emptyPermissions: SectionPermissions = {
  can_access_workday: false,
  can_access_finance: false,
  can_access_calculators: false,
  can_access_planned_tasks: false,
};

export default function UsersPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [summaryAccess, setSummaryAccess] = useState<Record<string, string[]>>({});
  const [adminId, setAdminId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [invitePermissions, setInvitePermissions] =
    useState<SectionPermissions>(emptyPermissions);
  const [invitationLink, setInvitationLink] = useState("");
  const [creatingInvitation, setCreatingInvitation] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState("");
  const [expandedUserId, setExpandedUserId] = useState("");

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
          .select(`
            id,
            email,
            display_name,
            avatar_url,
            role,
            data_owner_id,
            can_access_workday,
            can_access_finance,
            can_access_calculators,
            can_access_planned_tasks
          `)
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

  async function changeSectionAccess(
    profileId: string,
    key: SectionAccessKey,
    allowed: boolean,
  ) {
    const { error } = await supabase
      .from("profiles")
      .update({ [key]: allowed })
      .eq("id", profileId);

    if (error) {
      setMessage("Sadaļas piekļuvi neizdevās saglabāt.");
      return;
    }

    setProfiles((current) =>
      current.map((item) =>
        item.id === profileId ? { ...item, [key]: allowed } : item,
      ),
    );
    setMessage("Sadaļas piekļuve saglabāta.");
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
      body: JSON.stringify(invitePermissions),
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
    setInvitePermissions(emptyPermissions);
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
        <p className="text-sm text-zinc-500">
          Kopsavilkums un Profils būs pieejams vienmēr. Atzīmē pārējās
          sadaļas.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {sectionOptions.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={invitePermissions[key]}
                onChange={(event) =>
                  setInvitePermissions((current) => ({
                    ...current,
                    [key]: event.target.checked,
                  }))
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div>
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
            <button
              type="button"
              disabled={profile.role === "admin"}
              onClick={() =>
                setExpandedUserId((current) =>
                  current === profile.id ? "" : profile.id,
                )
              }
              className="flex w-full items-center justify-between gap-3 text-left disabled:cursor-default"
              aria-expanded={
                profile.role === "admin" || expandedUserId === profile.id
              }
            >
              <div className="flex items-center gap-3">
                <UserAvatar name={profile.display_name} avatarUrl={profile.avatar_url} />
                <div>
                  <p className="font-medium">{profile.display_name}</p>
                  <p className="text-xs text-zinc-500">{profile.email || profile.id}</p>
                  {profile.role === "admin" && (
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                      Administrators
                    </p>
                  )}
                </div>
              </div>
              {profile.role !== "admin" && (
                <span
                  aria-hidden="true"
                  className={`shrink-0 text-xl text-zinc-500 transition-transform ${
                    expandedUserId === profile.id ? "rotate-180" : ""
                  }`}
                >
                  ⌄
                </span>
              )}
            </button>

            {(profile.role === "admin" || expandedUserId === profile.id) && (
              <>
                <div className="border-t border-zinc-200 pt-3 dark:border-zinc-700">
                  <p className="mb-2 text-sm font-semibold">Sadaļas:</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {sectionOptions.map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={profile.role === "admin" || profile[key]}
                          disabled={profile.role === "admin"}
                          onChange={(event) =>
                            changeSectionAccess(
                              profile.id,
                              key,
                              event.target.checked,
                            )
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {profile.role !== "admin" && (
                  <>
                    <div className="border-t border-zinc-200 pt-3 dark:border-zinc-700">
                      <p className="mb-2 text-sm font-semibold">
                        Drīkst skatīt kopsavilkumus:
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {profiles.map((owner) => {
                          const isOwnProfile = owner.id === profile.id;
                          return (
                            <label key={owner.id} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={
                                  isOwnProfile ||
                                  (summaryAccess[profile.id] || []).includes(owner.id)
                                }
                                disabled={isOwnProfile}
                                onChange={(event) =>
                                  toggleSummaryAccess(
                                    profile.id,
                                    owner.id,
                                    event.target.checked,
                                  )
                                }
                              />
                              <span>
                                {owner.display_name || owner.email || owner.id}
                                {isOwnProfile ? " (savs)" : ""}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="border-t border-zinc-200 pt-3 dark:border-zinc-700">
                      <button
                        type="button"
                        disabled={deletingUserId === profile.id}
                        onClick={() => deleteUser(profile)}
                        className="rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                      >
                        {deletingUserId === profile.id ? "Dzēš..." : "Dzēst lietotāju"}
                      </button>
                    </div>
                  </>
                )}
              </>
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
