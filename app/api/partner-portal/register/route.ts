import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";

export async function POST(request: NextRequest) {
  const client = getSupabaseAdmin();
  if (!client) return NextResponse.json({ error: "Serveris nav konfigurēts." }, { status: 500 });
  const body = (await request.json()) as { action?: "validate" | "claim"; token?: string; email?: string; userId?: string };
  const action = body.action || "validate";
  const token = String(body.token || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const userId = String(body.userId || "").trim();
  if (!token) return NextResponse.json({ error: "Reģistrācijas saite nav derīga." }, { status: 400 });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date().toISOString();
  const { data: invitation } = await client
    .from("partner_portal_invitations")
    .select("id, partner_id")
    .eq("token_hash", tokenHash)
    .eq("active", true)
    .is("used_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (!invitation) {
    return NextResponse.json({ error: "Saite nav derīga, ir izmantota vai tai beidzies termiņš." }, { status: 400 });
  }
  const claimedInvitation = invitation as { id: number; partner_id: number };

  const { data: existing } = await client
    .from("partner_portal_accounts")
    .select("user_id")
    .eq("partner_id", claimedInvitation.partner_id)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "Partnera konts jau ir izveidots." }, { status: 409 });

  const { data: partner } = await client
    .from("partners")
    .select("display_name")
    .eq("id", claimedInvitation.partner_id)
    .single();
  if (action === "validate") {
    return NextResponse.json({ valid: true, displayName: partner?.display_name || "Partneris" });
  }
  if (!userId || !email) return NextResponse.json({ error: "Kontu neizdevās piesaistīt." }, { status: 400 });

  const { data: created, error: userError } = await client.auth.admin.getUserById(userId);
  const createdEmail = created.user?.email?.trim().toLowerCase();
  if (userError || !created.user || createdEmail !== email || created.user.user_metadata?.account_type !== "partner") {
    return NextResponse.json({ error: "Partnera reģistrāciju neizdevās apstiprināt." }, { status: 400 });
  }
  if (created.user.email_confirmed_at) {
    await client.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: "E-pasta apstiprināšana serverī nav aktivizēta. Sazinies ar administratoru." }, { status: 503 });
  }

  const { data: invitationOwner } = await client
    .from("partner_portal_invitations")
    .select("created_by")
    .eq("id", claimedInvitation.id)
    .single();
  const { error: accountError } = await client.from("partner_portal_accounts").insert({
    partner_id: claimedInvitation.partner_id,
    user_id: userId,
    created_by: invitationOwner?.created_by,
  });
  if (accountError) {
    await client.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: "Partnera kontu neizdevās piesaistīt." }, { status: 500 });
  }

  await Promise.all([
    client.from("partner_portal_invitations").update({
      used_at: now,
      used_by: userId,
      active: false,
      updated_at: now,
    }).eq("id", claimedInvitation.id),
    client.from("profiles").update({
      can_access_workday: false,
      can_access_finance: false,
      can_access_calculators: false,
      can_access_planned_tasks: false,
      can_access_fleet: false,
      can_access_cargo_types: false,
      can_access_partners: false,
    }).eq("id", userId),
  ]);
  return NextResponse.json({ success: true });
}
