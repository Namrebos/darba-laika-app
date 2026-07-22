import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://hsohjtcuqlxmthvpkvlc.supabase.co";

function storagePathFromUrl(url: string) {
  const marker = "/storage/v1/object/public/task-images/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return null;
  return decodeURIComponent(url.slice(markerIndex + marker.length).split("?")[0]);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ workLogId: string }> },
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
  const { data: authData, error: authError } = await adminClient.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Nederīga sesija." }, { status: 401 });
  }

  const { workLogId } = await context.params;
  const { data: workLog } = await adminClient
    .from("work_logs")
    .select("id, user_id")
    .eq("id", workLogId)
    .single();
  if (!workLog) {
    return NextResponse.json({ error: "Darba diena nav atrasta." }, { status: 404 });
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();
  if (workLog.user_id !== authData.user.id && profile?.role !== "admin") {
    return NextResponse.json({ error: "Nav tiesību dzēst šo darba dienu." }, { status: 403 });
  }

  const { data: tasks, error: taskError } = await adminClient
    .from("task_logs")
    .select("id")
    .eq("session_id", workLog.id);
  if (taskError) {
    return NextResponse.json({ error: "Neizdevās atrast saistītos uzdevumus." }, { status: 500 });
  }

  const taskIds = (tasks || []).map((task) => task.id);
  if (taskIds.length > 0) {
    const { data: imageRows, error: imageError } = await adminClient
      .from("task_images")
      .select("url")
      .in("task_log_id", taskIds);
    if (imageError) {
      return NextResponse.json({ error: "Neizdevās atrast saistītos attēlus." }, { status: 500 });
    }

    const paths = (imageRows || [])
      .map(({ url }) => storagePathFromUrl(url))
      .filter((path): path is string => Boolean(path));
    if (paths.length > 0) {
      const { error: storageError } = await adminClient.storage.from("task-images").remove(paths);
      if (storageError) {
        return NextResponse.json({ error: "Attēlu failus neizdevās izdzēst." }, { status: 500 });
      }
    }
  }

  const { error: deleteError } = await adminClient.from("work_logs").delete().eq("id", workLog.id);
  if (deleteError) {
    return NextResponse.json({ error: "Darba dienu neizdevās izdzēst." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
