import { NextRequest, NextResponse } from "next/server";
import { getPartnerPortalSession } from "@/lib/partnerPortalServer";

export async function GET(request: NextRequest) {
  const auth = await getPartnerPortalSession(request);
  if (!auth) return NextResponse.json({ error: "Nav partnera pieejas." }, { status: 403 });

  const month = request.nextUrl.searchParams.get("month") || "";
  let query = auth.client
    .from("transport_requests")
    .select(`
      id, created_at, pickup_date, pickup_time, pickup_address,
      dropoff_date, dropoff_address, cargo_type,
      planned_tasks!planned_tasks_transport_request_id_fkey(id, status, scheduled_date, scheduled_time)
    `)
    .eq("partner_id", auth.partnerId)
    .order("created_at", { ascending: false });
  if (/^\d{4}-\d{2}$/.test(month)) {
    const [year, monthNumber] = month.split("-").map(Number);
    const from = `${month}-01`;
    const to = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
    query = query.gte("pickup_date", from).lt("pickup_date", to);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Pieteikumus neizdevās ielādēt." }, { status: 500 });
  return NextResponse.json({ requests: data || [] });
}
