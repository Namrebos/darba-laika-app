import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";
import { configureWebPush } from "@/lib/webPush";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function POST(request: NextRequest) {
  const admin = getSupabaseAdmin();
  const push = configureWebPush();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!admin || !push || !token) return NextResponse.json({ error: "Nav piekļuves." }, { status: 401 });

  const { data: config } = await admin
    .from("notification_dispatch_config")
    .select("token_hash")
    .eq("id", true)
    .maybeSingle();
  if (!config || config.token_hash !== sha256(token)) {
    return NextResponse.json({ error: "Nav piekļuves." }, { status: 401 });
  }

  const { data: notifications } = await admin
    .from("notification_queue")
    .select("id, recipient_id, title, body, url")
    .is("sent_at", null)
    .lte("deliver_after", new Date().toISOString())
    .order("created_at")
    .limit(100);

  const pendingNotifications = (notifications || []) as Array<{
    id: number;
    recipient_id: string;
    title: string;
    body: string;
    url: string;
  }>;
  let sent = 0;
  for (const notification of pendingNotifications) {
    const { data: preferencesData } = await admin
      .from("notification_preferences")
      .select("enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end")
      .eq("user_id", notification.recipient_id)
      .maybeSingle();
    const preferences = preferencesData as {
      enabled: boolean;
      quiet_hours_enabled: boolean;
      quiet_hours_start: string;
      quiet_hours_end: string;
    } | null;
    if (!preferences?.enabled) {
      await admin.from("notification_queue").update({ sent_at: new Date().toISOString() }).eq("id", notification.id);
      continue;
    }
    if (preferences.quiet_hours_enabled) {
      const currentTime = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Riga",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
      const start = preferences.quiet_hours_start.slice(0, 5);
      const end = preferences.quiet_hours_end.slice(0, 5);
      const isQuiet = start <= end
        ? currentTime >= start && currentTime < end
        : currentTime >= start || currentTime < end;
      if (isQuiet) continue;
    }
    const { data: subscriptions } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", notification.recipient_id);
    for (const subscription of (subscriptions || []) as Array<{
      id: number;
      endpoint: string;
      p256dh: string;
      auth: string;
    }>) {
      try {
        await push.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify({
            title: notification.title,
            body: notification.body,
            url: notification.url || "/",
          }),
        );
        sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", subscription.id);
        }
      }
    }
    await admin
      .from("notification_queue")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", notification.id)
      .is("sent_at", null);
  }

  return NextResponse.json({ ok: true, notifications: pendingNotifications.length, sent });
}
