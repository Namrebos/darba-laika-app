import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SectionPermissions } from "@/lib/access";
import { createHash, randomBytes } from "crypto";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://hsohjtcuqlxmthvpkvlc.supabase.co";

export async function POST(request: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Serverī nav iestatīta SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const bearer = request.headers.get("authorization");
  const accessToken = bearer?.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!accessToken) {
    return NextResponse.json({ error: "Nav autorizācijas." }, { status: 401 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } =
    await adminClient.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Nederīga sesija." }, { status: 401 });
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json(
      { error: "Uzaicinājumus drīkst veidot tikai administrators." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as Partial<SectionPermissions>;
  const permissions: SectionPermissions = {
    can_access_workday: body.can_access_workday === true,
    can_access_finance: body.can_access_finance === true,
    can_access_calculators: body.can_access_calculators === true,
    can_access_planned_tasks: body.can_access_planned_tasks === true,
  };
  const hasAdditionalSection = Object.values(permissions).some(Boolean);
  const role = hasAdditionalSection ? "member" : "viewer";

  if (
    Object.values(body).some(
      (value) => typeof value !== "boolean",
    )
  ) {
    return NextResponse.json(
      { error: "Norādi derīgas sadaļu pieejas." },
      { status: 400 },
    );
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const { error } = await adminClient.from("user_invitations").insert({
    token_hash: tokenHash,
    role,
    invited_by: authData.user.id,
    expires_at: expiresAt,
    ...permissions,
  });

  if (error) {
    return NextResponse.json(
      { error: "Uzaicinājuma saiti neizdevās izveidot." },
      { status: 500 },
    );
  }

  const productionOrigin = (
    process.env.APP_PRODUCTION_URL ||
    "https://darba-laika-app.vercel.app"
  ).replace(/\/$/, "");
  const invitationLink = `${productionOrigin}/register?token=${encodeURIComponent(token)}`;
  return NextResponse.json({ invitationLink, expiresAt });
}
