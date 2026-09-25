import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/partnerPortalServer";

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth) return NextResponse.json({ error: "Nav pieejas." }, { status: 403 });

  const [{ data: accounts }, { data: invitations }] = await Promise.all([
    auth.client.from("partner_portal_accounts").select("partner_id, user_id"),
    auth.client
      .from("partner_portal_invitations")
      .select("partner_id, token_value, active, expires_at, used_at"),
  ]);
  const origin = request.nextUrl.origin.replace(/\/$/, "");
  const invitationRows = (invitations || []) as Array<{
    partner_id: number;
    token_value: string;
    active: boolean;
    expires_at: string;
    used_at: string | null;
  }>;
  return NextResponse.json({
    accounts: accounts || [],
    invitations: invitationRows.map((item) => ({
      partnerId: item.partner_id,
      active: item.active && !item.used_at && new Date(item.expires_at).getTime() > Date.now(),
      url: item.active && !item.used_at
        ? `${origin}/partner-portal/register?token=${encodeURIComponent(item.token_value)}`
        : "",
      expiresAt: item.expires_at,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth) return NextResponse.json({ error: "Nav pieejas." }, { status: 403 });
  const body = (await request.json()) as { partnerId?: number; action?: string };
  const partnerId = Number(body.partnerId);
  if (!Number.isSafeInteger(partnerId) || partnerId <= 0) {
    return NextResponse.json({ error: "Partneris nav derīgs." }, { status: 400 });
  }

  const { data: existingAccount } = await auth.client
    .from("partner_portal_accounts")
    .select("user_id")
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (existingAccount) {
    return NextResponse.json(
      { error: "Šim partnerim konts jau ir izveidots." },
      { status: 409 },
    );
  }

  if (body.action === "deactivate") {
    await auth.client
      .from("partner_portal_invitations")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("partner_id", partnerId);
    return NextResponse.json({ active: false, url: "" });
  }

  const { data: partner } = await auth.client
    .from("partners")
    .select("id")
    .eq("id", partnerId)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "Partneris nav atrasts." }, { status: 404 });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await auth.client.from("partner_portal_invitations").upsert({
    partner_id: partnerId,
    token_hash: hashToken(token),
    token_value: token,
    created_by: auth.userId,
    expires_at: expiresAt,
    used_at: null,
    used_by: null,
    active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "partner_id" });
  if (error) {
    return NextResponse.json({ error: "Reģistrācijas saiti neizdevās izveidot." }, { status: 500 });
  }
  const origin = request.nextUrl.origin.replace(/\/$/, "");
  return NextResponse.json({
    active: true,
    url: `${origin}/partner-portal/register?token=${encodeURIComponent(token)}`,
    expiresAt,
  });
}
