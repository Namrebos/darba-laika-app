import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";

async function getAuthorizedAdmin(request: NextRequest) {
  const admin = getSupabaseAdmin();
  const accessToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!admin || !accessToken) return null;

  const { data: authData, error: authError } =
    await admin.auth.getUser(accessToken);
  if (authError || !authData.user) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  return profile?.role === "admin" ? admin : null;
}

export async function GET(request: NextRequest) {
  const admin = await getAuthorizedAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Nav administratora piekļuves." }, { status: 403 });
  }
  const { data, error } = await admin
    .from("notification_dispatch_config")
    .select("notifications_paused")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Paziņojumu statusu neizdevās ielādēt." },
      { status: 500 },
    );
  }

  return NextResponse.json({ paused: data?.notifications_paused === true });
}

export async function PATCH(request: NextRequest) {
  const admin = await getAuthorizedAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Nav administratora piekļuves." }, { status: 403 });
  }
  const authorizedAdmin = admin;

  const body = (await request.json()) as { paused?: unknown };
  if (typeof body.paused !== "boolean") {
    return NextResponse.json({ error: "Norādi derīgu paziņojumu statusu." }, { status: 400 });
  }

  async function setPauseState() {
    return authorizedAdmin
      .from("notification_dispatch_config")
      .update({ notifications_paused: body.paused })
      .eq("id", true);
  }

  async function suppressPendingNotifications() {
    return authorizedAdmin
      .from("notification_queue")
      .update({ sent_at: new Date().toISOString() })
      .is("sent_at", null)
      .eq("originated_by_admin", true);
  }

  // Administratora radītos paziņojumus pauzes laikā neatliekam. Citu
  // lietotāju radītie paliek rindā un tiek nosūtīti pēc pauzes izslēgšanas.
  const firstResult = await setPauseState();
  const secondResult = body.paused
    ? await suppressPendingNotifications()
    : { error: null };

  if (firstResult.error || secondResult.error) {
    return NextResponse.json(
      { error: "Paziņojumu statusu neizdevās saglabāt." },
      { status: 500 },
    );
  }

  return NextResponse.json({ paused: body.paused });
}
