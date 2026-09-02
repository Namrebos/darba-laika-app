import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";

async function requireAdmin(request: NextRequest) {
  const client = getSupabaseAdmin();
  const bearer = request.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!client || !token) return null;
  const { data: auth } = await client.auth.getUser(token);
  if (!auth.user) return null;
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  return profile?.role === "admin" ? { client, userId: auth.user.id } : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth) return NextResponse.json({ error: "Nav pieejas." }, { status: 403 });
  const { data } = await auth.client.from("partner_request_links").select("partner_id, token_value, active");
  const origin = request.nextUrl.origin.replace(/\/$/, "");
  return NextResponse.json({ links: (data || []).map((row) => ({ partnerId: row.partner_id, active: row.active, url: row.active ? `${origin}/partner-request/${row.token_value}` : "" })) });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth) return NextResponse.json({ error: "Nav pieejas." }, { status: 403 });
  const body = await request.json() as { partnerId?: number; action?: string };
  const partnerId = Number(body.partnerId);
  if (!Number.isSafeInteger(partnerId) || partnerId <= 0) return NextResponse.json({ error: "Partneris nav derīgs." }, { status: 400 });
  if (body.action === "deactivate") {
    await auth.client.from("partner_request_links").update({ active: false, updated_at: new Date().toISOString() }).eq("partner_id", partnerId);
    return NextResponse.json({ active: false, url: "" });
  }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { error } = await auth.client.from("partner_request_links").upsert({ partner_id: partnerId, token_hash: tokenHash, token_value: token, created_by: auth.userId, active: true, updated_at: new Date().toISOString() }, { onConflict: "partner_id" });
  if (error) return NextResponse.json({ error: "Saiti neizdevās izveidot." }, { status: 500 });
  const origin = request.nextUrl.origin.replace(/\/$/, "");
  return NextResponse.json({ active: true, url: `${origin}/partner-request/${token}` });
}
