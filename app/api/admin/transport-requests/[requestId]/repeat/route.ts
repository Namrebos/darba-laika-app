import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";

export async function POST(request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  const client = getSupabaseAdmin();
  const bearer = request.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!client || !token) return NextResponse.json({ error: "Nav autorizācijas." }, { status: 401 });
  const { data: auth } = await client.auth.getUser(token);
  if (!auth.user) return NextResponse.json({ error: "Nederīga sesija." }, { status: 401 });
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Tikai administrators var atkārtot braucienu." }, { status: 403 });
  const { requestId } = await context.params;
  const id = Number(requestId);
  const { data: source } = await client.from("transport_requests").select("*").eq("id", id).single();
  if (!source) return NextResponse.json({ error: "Brauciens nav atrasts." }, { status: 404 });

  const { data: link } = await client.from("transport_request_links").insert({
    token_hash: createHash("sha256").update(randomBytes(32)).digest("hex"),
    created_by: auth.user.id,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    submitted_at: new Date().toISOString(),
  }).select("id").single();
  if (!link) return NextResponse.json({ error: "Kopiju neizdevās sagatavot." }, { status: 500 });
  const { id: _id, link_id: _link, created_at: _created, updated_at: _updated, ...fields } = source;
  const { data: copy, error } = await client.from("transport_requests").insert({ ...fields, link_id: link.id, created_by: auth.user.id }).select("id").single();
  if (error || !copy) return NextResponse.json({ error: "Braucienu neizdevās nokopēt." }, { status: 400 });
  const title = source.sender_type === "company" ? source.sender_company_name : [source.sender_first_name, source.sender_last_name].filter(Boolean).join(" ");
  const note = [source.cargo_type, source.additional_notes].filter(Boolean).join("\n");
  const { error: taskError } = await client.from("planned_tasks").insert({ created_by: auth.user.id, assignee_id: null, title, note, scheduled_date: null, scheduled_time: null, status: "new", transport_request_id: copy.id });
  if (taskError) return NextResponse.json({ error: "Brauciena kartīti neizdevās izveidot." }, { status: 500 });
  return NextResponse.json({ requestId: copy.id });
}
