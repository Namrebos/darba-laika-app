import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";

async function authenticatedUser(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const admin = getSupabaseAdmin();
  if (!admin || !token) return { admin, user: null };
  const { data } = await admin.auth.getUser(token);
  return { admin, user: data.user };
}

export async function POST(request: NextRequest) {
  const { admin, user } = await authenticatedUser(request);
  if (!admin || !user) return NextResponse.json({ error: "Nav piekļuves." }, { status: 401 });

  const input = (await request.json()) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!input.endpoint || !input.keys?.p256dh || !input.keys.auth) {
    return NextResponse.json({ error: "Nederīgs ierīces abonements." }, { status: 400 });
  }

  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      user_agent: request.headers.get("user-agent") || "",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  return error
    ? NextResponse.json({ error: "Ierīci neizdevās pieslēgt." }, { status: 500 })
    : NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { admin, user } = await authenticatedUser(request);
  if (!admin || !user) return NextResponse.json({ error: "Nav piekļuves." }, { status: 401 });
  const input = (await request.json()) as { endpoint?: string };
  if (input.endpoint) {
    await admin.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", input.endpoint);
  }
  return NextResponse.json({ ok: true });
}
