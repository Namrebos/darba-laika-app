import { NextRequest, NextResponse } from "next/server";
import { getPartnerPortalSession } from "@/lib/partnerPortalServer";

export async function GET(request: NextRequest) {
  const auth = await getPartnerPortalSession(request);
  if (!auth) return NextResponse.json({ error: "Nav partnera pieejas." }, { status: 403 });
  const [{ data: partner }, { data: requestLink }] = await Promise.all([
    auth.client.from("partners").select("id, display_name").eq("id", auth.partnerId).single(),
    auth.client.from("partner_request_links").select("token_value, active").eq("partner_id", auth.partnerId).maybeSingle(),
  ]);
  const origin = request.nextUrl.origin.replace(/\/$/, "");
  const link = requestLink as { token_value: string; active: boolean } | null;
  return NextResponse.json({
    partner,
    newRequestUrl: link?.active
      ? `${origin}/partner-request/${encodeURIComponent(link.token_value)}`
      : "",
  });
}
