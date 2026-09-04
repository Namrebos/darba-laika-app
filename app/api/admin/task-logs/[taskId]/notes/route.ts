import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Servera savienojums nav konfigurēts." }, { status: 500 });
  }

  const bearer = request.headers.get("authorization");
  const accessToken = bearer?.startsWith("Bearer ") ? bearer.slice(7) : "";
  const { data: authData } = await admin.auth.getUser(accessToken);
  if (!authData.user) {
    return NextResponse.json({ error: "Nederīga sesija." }, { status: 401 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Šo darbību drīkst veikt tikai administrators." }, { status: 403 });
  }

  const { taskId } = await context.params;
  const numericTaskId = Number(taskId);
  if (!Number.isSafeInteger(numericTaskId) || numericTaskId <= 0) {
    return NextResponse.json({ error: "Uzdevums nav atrasts." }, { status: 404 });
  }

  const body = (await request.json()) as { notes?: unknown };
  if (typeof body.notes !== "string" || body.notes.length > 5000) {
    return NextResponse.json({ error: "Piezīmju teksts nav derīgs." }, { status: 400 });
  }
  const notes = body.notes.trim();

  const { data: task, error: taskError } = await admin
    .from("task_logs")
    .select("id, end_time")
    .eq("id", numericTaskId)
    .maybeSingle();
  if (taskError || !task) {
    return NextResponse.json({ error: "Uzdevums nav atrasts." }, { status: 404 });
  }
  if (!task.end_time) {
    return NextResponse.json({ error: "Labot var tikai noslēgta uzdevuma piezīmes." }, { status: 400 });
  }

  const { error: updateError } = await admin
    .from("task_logs")
    .update({ note: notes })
    .eq("id", numericTaskId);
  if (updateError) {
    return NextResponse.json({ error: "Piezīmes neizdevās saglabāt." }, { status: 400 });
  }

  const { error: plannedTaskError } = await admin
    .from("planned_tasks")
    .update({ note: notes, updated_at: new Date().toISOString() })
    .eq("task_log_id", numericTaskId);
  if (plannedTaskError) {
    return NextResponse.json({ error: "Brauciena piezīmes neizdevās sinhronizēt." }, { status: 400 });
  }

  return NextResponse.json({ notes });
}
