import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/partnerPortalServer";

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth) return NextResponse.json({ error: "Nav pieejas." }, { status: 403 });
  const partnerId = Number(request.nextUrl.searchParams.get("partnerId"));
  if (!Number.isSafeInteger(partnerId) || partnerId <= 0) {
    return NextResponse.json({ error: "Partneris nav derīgs." }, { status: 400 });
  }

  const [{ data: partner }, { data: contacts }, { data: testRequests }] = await Promise.all([
    auth.client
      .from("partners")
      .select("id, display_name, partner_type, first_name, last_name, company_name, registration_number, contact_name, address, latitude, longitude, phone, email")
      .eq("id", partnerId)
      .maybeSingle(),
    auth.client.from("partner_contacts").select("name, phone, sort_order").eq("partner_id", partnerId).order("sort_order").order("id"),
    auth.client.from("partner_portal_test_requests").select("id, payload, created_at").eq("partner_id", partnerId).order("created_at", { ascending: false }),
  ]);
  if (!partner) return NextResponse.json({ error: "Partneris nav atrasts." }, { status: 404 });
  return NextResponse.json({ partner, contacts: contacts || [], requests: testRequests || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth) return NextResponse.json({ error: "Nav pieejas." }, { status: 403 });
  const formData = await request.formData();
  const partnerId = Number(formData.get("test_partner_id"));
  const payloadText = String(formData.get("payload") || "");
  if (!Number.isSafeInteger(partnerId) || partnerId <= 0 || !payloadText) {
    return NextResponse.json({ error: "Trūkst testa pieteikuma datu." }, { status: 400 });
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadText) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Testa pieteikuma dati nav derīgi." }, { status: 400 });
  }
  const required = [
    clean(payload.pickup_address, 250), clean(payload.dropoff_address, 250),
    clean(payload.pickup_date, 10), clean(payload.dropoff_date, 10), clean(payload.cargo_type, 100),
  ];
  if (required.some((value) => !value) || !Number.isFinite(Number(payload.pickup_lat)) || !Number.isFinite(Number(payload.pickup_lng)) || !Number.isFinite(Number(payload.dropoff_lat)) || !Number.isFinite(Number(payload.dropoff_lng))) {
    return NextResponse.json({ error: "Aizpildi obligātos laukus un atzīmē abas vietas kartē." }, { status: 400 });
  }
  const { data: partner } = await auth.client.from("partners").select("id").eq("id", partnerId).maybeSingle();
  if (!partner) return NextResponse.json({ error: "Partneris nav atrasts." }, { status: 404 });

  const { data, error } = await auth.client.from("partner_portal_test_requests").insert({
    partner_id: partnerId,
    created_by: auth.userId,
    payload,
  }).select("id").single();
  if (error || !data) return NextResponse.json({ error: "Testa pieteikumu neizdevās saglabāt." }, { status: 500 });
  return NextResponse.json({ success: true, id: data.id });
}
