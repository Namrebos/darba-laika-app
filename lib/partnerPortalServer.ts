import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";

export async function getPartnerPortalSession(request: NextRequest) {
  const client = getSupabaseAdmin();
  const bearer = request.headers.get("authorization");
  const accessToken = bearer?.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!client || !accessToken) return null;

  const { data: auth } = await client.auth.getUser(accessToken);
  if (!auth.user) return null;

  const { data: account } = await client
    .from("partner_portal_accounts")
    .select("partner_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!account) return null;

  return {
    client,
    userId: auth.user.id,
    partnerId: Number(account.partner_id),
  };
}

export async function requireAdmin(request: NextRequest) {
  const client = getSupabaseAdmin();
  const bearer = request.headers.get("authorization");
  const accessToken = bearer?.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!client || !accessToken) return null;

  const { data: auth } = await client.auth.getUser(accessToken);
  if (!auth.user) return null;
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  return profile?.role === "admin"
    ? { client, userId: auth.user.id }
    : null;
}
