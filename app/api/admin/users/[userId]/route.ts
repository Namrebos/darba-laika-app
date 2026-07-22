import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://hsohjtcuqlxmthvpkvlc.supabase.co";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "Servera konfigurācijas kļūda." }, { status: 500 });
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
    return NextResponse.json({ error: "Lietotājus drīkst dzēst tikai administrators." }, { status: 403 });
  }

  const { userId } = await context.params;
  if (userId === authData.user.id) {
    return NextResponse.json({ error: "Savu administratora kontu dzēst nevar." }, { status: 400 });
  }

  const { data: targetProfile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (!targetProfile) {
    return NextResponse.json({ error: "Lietotājs nav atrasts." }, { status: 404 });
  }
  if (targetProfile.role === "admin") {
    return NextResponse.json({ error: "Administratora kontu dzēst nevar." }, { status: 400 });
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) {
    return NextResponse.json({ error: "Lietotāju neizdevās dzēst." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
