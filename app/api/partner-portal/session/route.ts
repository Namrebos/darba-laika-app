import { NextRequest, NextResponse } from "next/server";
import { getPartnerPortalSession } from "@/lib/partnerPortalServer";

export async function GET(request: NextRequest) {
  const auth = await getPartnerPortalSession(request);
  if (!auth) return NextResponse.json({ error: "Nav partnera pieejas." }, { status: 403 });
  const [{ data: partner }, { data: contacts }] = await Promise.all([
    auth.client.from("partners").select("id, display_name, partner_type, first_name, last_name, company_name, registration_number, contact_name, phone, address, latitude, longitude, email, logo_url, profile_completed").eq("id", auth.partnerId).single(),
    auth.client.from("partner_contacts").select("id, name, phone, sort_order").eq("partner_id", auth.partnerId).order("sort_order").order("id"),
  ]);
  const origin = request.nextUrl.origin.replace(/\/$/, "");
  return NextResponse.json({
    partner: partner ? { ...partner, email: partner.email || auth.email, contacts: contacts || [] } : null,
    newRequestUrl: partner?.profile_completed ? `${origin}/partner-portal/new-trip` : "",
  });
}
