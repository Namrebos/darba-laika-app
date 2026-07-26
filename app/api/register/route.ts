import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://hsohjtcuqlxmthvpkvlc.supabase.co";

export async function POST(request: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Reģistrācija serverī nav konfigurēta." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as {
    token?: string;
    email?: string;
    password?: string;
    displayName?: string;
  };
  const token = body.token?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password || "";
  const displayName = body.displayName?.trim() || "";
  if (!token || !email || password.length < 8 || !displayName || displayName.length > 50) {
    return NextResponse.json(
      { error: "Ievadi lietotājvārdu, derīgu e-pastu un vismaz 8 zīmju paroli." },
      { status: 400 },
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const claimedAt = new Date().toISOString();

  const { data: invitation } = await adminClient
    .from("user_invitations")
    .update({ used_at: claimedAt })
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", claimedAt)
    .select("id, role, invited_by")
    .maybeSingle();

  if (!invitation) {
    return NextResponse.json(
      { error: "Uzaicinājuma saite nav derīga, ir izmantota vai tai beidzies termiņš." },
      { status: 400 },
    );
  }

  const { data: created, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        invited_role: invitation.role,
        invited_by: invitation.invited_by,
        display_name: displayName,
      },
    });

  if (createError || !created.user) {
    await adminClient
      .from("user_invitations")
      .update({ used_at: null })
      .eq("id", invitation.id)
      .eq("used_at", claimedAt);
    return NextResponse.json(
      {
        error: createError?.message.toLowerCase().includes("already")
          ? "Šāds e-pasts jau ir reģistrēts."
          : "Kontu neizdevās izveidot.",
      },
      { status: 400 },
    );
  }

  await adminClient
    .from("user_invitations")
    .update({ used_by: created.user.id })
    .eq("id", invitation.id);

  return NextResponse.json({ success: true });
}
