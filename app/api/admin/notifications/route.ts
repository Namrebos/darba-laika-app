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
    const suppressedAt = new Date().toISOString();
    const directResult = await authorizedAdmin
      .from("notification_queue")
      .update({ sent_at: suppressedAt })
      .is("sent_at", null)
      .eq("originated_by_admin", true);
    if (directResult.error) return directResult;

    // Vecākām rindām, kas izveidotas servera RPC kontekstā, auth.uid() nebija
    // pieejams un administratora izcelsme varēja palikt neatzīmēta.
    const { data: pendingRows, error: pendingError } = await authorizedAdmin
      .from("notification_queue")
      .select("id, url")
      .is("sent_at", null)
      .eq("notification_type", "new_request");
    if (pendingError) return { error: pendingError };

    const requestIds = (pendingRows || [])
      .map((row) => Number(String(row.url || "").match(/transportRequest=(\d+)/)?.[1]))
      .filter((id) => Number.isSafeInteger(id) && id > 0);
    if (requestIds.length === 0) return { error: null };

    const { data: adminRequests, error: requestError } = await authorizedAdmin
      .from("transport_requests")
      .select("id")
      .in("id", requestIds)
      .eq("submission_source", "admin");
    if (requestError) return { error: requestError };

    const adminRequestIds = new Set((adminRequests || []).map((item) => item.id));
    const queueIds = (pendingRows || [])
      .filter((row) => {
        const requestId = Number(String(row.url || "").match(/transportRequest=(\d+)/)?.[1]);
        return adminRequestIds.has(requestId);
      })
      .map((row) => row.id);
    if (queueIds.length === 0) return { error: null };

    return authorizedAdmin
      .from("notification_queue")
      .update({ sent_at: suppressedAt, originated_by_admin: true })
      .in("id", queueIds)
      .is("sent_at", null);
  }

  // Administratora radītos paziņojumus pauzes laikā neatliekam. Citu
  // lietotāju radītie paliek rindā un tiek nosūtīti pēc pauzes izslēgšanas.
  // Vispirms izmetam administratora rindu un tikai pēc tam mainām pauzes
  // stāvokli. Pretējā secībā cron var paspēt rindu nosūtīt.
  const secondResult = await suppressPendingNotifications();
  const firstResult = secondResult.error
    ? { error: secondResult.error }
    : await setPauseState();

  if (firstResult.error || secondResult.error) {
    return NextResponse.json(
      { error: "Paziņojumu statusu neizdevās saglabāt." },
      { status: 500 },
    );
  }

  return NextResponse.json({ paused: body.paused });
}
