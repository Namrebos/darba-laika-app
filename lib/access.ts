import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "member" | "viewer";

export type AccessProfile = {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  role: AppRole;
  data_owner_id: string;
};

export function defaultProfile(user: User): AccessProfile {
  return {
    id: user.id,
    email: user.email ?? null,
    display_name: user.email?.split("@")[0] || "Lietotājs",
    avatar_url: null,
    role: "member",
    data_owner_id: user.id,
  };
}

export function homeForRole(role: AppRole) {
  return role === "viewer" ? "/summary" : "/workday";
}
