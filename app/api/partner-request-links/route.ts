import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";

export async function GET(request: NextRequest) {
  const client = getSupabaseAdmin();
  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  if (!client || !token) return NextResponse.json({ valid: false }, { status: 400 });
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: link } = await client.from("partner_request_links").select("partner_id").eq("token_hash", hash).eq("active", true).maybeSingle();
  if (!link) return NextResponse.json({ valid: false }, { status: 404 });
  const partnerId = Number((link as { partner_id: number }).partner_id);
  const [{ data: partner }, { data: contacts }] = await Promise.all([
    client.from("partners").select("id, display_name, partner_type, first_name, last_name, company_name, registration_number, contact_name, address, latitude, longitude, phone, email").eq("id", partnerId).single(),
    client.from("partner_contacts").select("name, phone, sort_order").eq("partner_id", partnerId).order("sort_order").order("id"),
  ]);
  if (!partner) return NextResponse.json({ valid: false }, { status: 404 });
  return NextResponse.json({ valid: true, partner, contacts: contacts || [] });
}
