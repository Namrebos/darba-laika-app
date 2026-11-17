import { NextRequest, NextResponse } from "next/server";
import { getPartnerPortalSession } from "@/lib/partnerPortalServer";

const defaults = {
  enabled: false,
  partner_all_status_changes: true,
  partner_status_sent: true,
  partner_status_planned: true,
  partner_status_started: true,
  partner_status_completed: true,
  partner_status_canceled: true,
};

export async function GET(request: NextRequest) {
  const auth = await getPartnerPortalSession(request);
  if (!auth) return NextResponse.json({ error: "Nav partnera pieejas." }, { status: 403 });

  const { data, error } = await auth.client
    .from("notification_preferences")
    .select("enabled, partner_all_status_changes, partner_status_sent, partner_status_planned, partner_status_started, partner_status_completed, partner_status_canceled")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Paziņojumu iestatījumus neizdevās ielādēt." }, { status: 500 });
  return NextResponse.json({ preferences: { ...defaults, ...(data || {}) } });
}

export async function PATCH(request: NextRequest) {
  const auth = await getPartnerPortalSession(request);
  if (!auth) return NextResponse.json({ error: "Nav partnera pieejas." }, { status: 403 });

  const body = await request.json() as Record<string, unknown>;
  const changes = {
    user_id: auth.userId,
    enabled: body.enabled === true,
    app_badge_enabled: false,
    partner_all_status_changes: body.partner_all_status_changes === true,
    partner_status_sent: body.partner_status_sent === true,
    partner_status_planned: body.partner_status_planned === true,
    partner_status_started: body.partner_status_started === true,
    partner_status_completed: body.partner_status_completed === true,
    partner_status_canceled: body.partner_status_canceled === true,
    updated_at: new Date().toISOString(),
  };
  const { error } = await auth.client
    .from("notification_preferences")
    .upsert(changes, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "Paziņojumu iestatījumus neizdevās saglabāt." }, { status: 500 });
  return NextResponse.json({ preferences: changes });
}
