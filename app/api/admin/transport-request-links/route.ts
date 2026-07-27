import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";

export async function POST(request: NextRequest) {
  const adminClient = getSupabaseAdmin();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Pieteikumu saišu izveide serverī nav konfigurēta." },
      { status: 500 },
    );
  }

  const bearer = request.headers.get("authorization");
  const accessToken = bearer?.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!accessToken) {
    return NextResponse.json({ error: "Nav autorizācijas." }, { status: 401 });
  }

  const { data: authData } = await adminClient.auth.getUser(accessToken);
  if (!authData.user) {
    return NextResponse.json({ error: "Nederīga sesija." }, { status: 401 });
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role, can_access_planned_tasks")
    .eq("id", authData.user.id)
    .single();

  if (
    profile?.role !== "admin" &&
    profile?.can_access_planned_tasks !== true
  ) {
    return NextResponse.json(
      { error: "Nav pieejas plānoto uzdevumu sadaļai." },
      { status: 403 },
    );
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error } = await adminClient.from("transport_request_links").insert({
    token_hash: tokenHash,
    created_by: authData.user.id,
    expires_at: expiresAt,
  });

  if (error) {
    return NextResponse.json(
      { error: "Pieteikuma saiti neizdevās izveidot." },
      { status: 500 },
    );
  }

  const origin = request.nextUrl.origin.replace(/\/$/, "");
  return NextResponse.json({
    requestLink: `${origin}/request/${encodeURIComponent(token)}`,
    expiresAt,
  });
}
