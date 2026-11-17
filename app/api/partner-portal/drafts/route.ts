import { NextRequest, NextResponse } from "next/server";
import { getPartnerPortalSession } from "@/lib/partnerPortalServer";

export async function GET(request: NextRequest) {
  const auth = await getPartnerPortalSession(request);
  if (!auth) return NextResponse.json({ error: "Nav partnera pieejas." }, { status: 403 });
  const { data, error } = await auth.client
    .from("partner_request_drafts")
    .select("id, payload, created_at, updated_at")
    .eq("partner_id", auth.partnerId)
    .eq("created_by", auth.userId)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Melnrakstus neizdevās ielādēt." }, { status: 500 });
  return NextResponse.json({ drafts: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await getPartnerPortalSession(request);
  if (!auth) return NextResponse.json({ error: "Nav partnera pieejas." }, { status: 403 });
  const body = await request.json() as { id?: number; payload?: unknown };
  const id = Number(body.id);
  const row = {
    partner_id: auth.partnerId,
    created_by: auth.userId,
    payload: body.payload || {},
    updated_at: new Date().toISOString(),
  };
  const query = Number.isSafeInteger(id) && id > 0
    ? auth.client.from("partner_request_drafts").update(row).eq("id", id).eq("partner_id", auth.partnerId).eq("created_by", auth.userId)
    : auth.client.from("partner_request_drafts").insert(row);
  const { data, error } = await query.select("id").single();
  if (error || !data) return NextResponse.json({ error: "Melnrakstu neizdevās saglabāt." }, { status: 500 });
  return NextResponse.json({ success: true, id: data.id });
}
