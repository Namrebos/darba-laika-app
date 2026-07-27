import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "member" | "viewer";

export type SectionAccessKey =
  | "can_access_workday"
  | "can_access_finance"
  | "can_access_calculators"
  | "can_access_planned_tasks";

export type SectionPermissions = Record<SectionAccessKey, boolean>;

export type AccessProfile = {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  role: AppRole;
  data_owner_id: string;
} & SectionPermissions;

export function defaultProfile(user: User): AccessProfile {
  return {
    id: user.id,
    email: user.email ?? null,
    display_name: user.email?.split("@")[0] || "Lietotājs",
    avatar_url: null,
    role: "member",
    data_owner_id: user.id,
    can_access_workday: false,
    can_access_finance: false,
    can_access_calculators: false,
    can_access_planned_tasks: false,
  };
}

export function hasSectionAccess(
  profile: Pick<AccessProfile, "role"> & Partial<SectionPermissions>,
  section: SectionAccessKey,
) {
  return profile.role === "admin" || profile[section] === true;
}

export function homeForProfile(
  profile: Pick<AccessProfile, "role" | SectionAccessKey>,
) {
  return hasSectionAccess(profile, "can_access_workday")
    ? "/workday"
    : "/summary";
}
