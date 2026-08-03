import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://hsohjtcuqlxmthvpkvlc.supabase.co";

type CorrectionBody = {
  ownerId?: string;
  date?: string;
  workLogId?: number | null;
  startTime?: string;
  endTime?: string;
  confirmTaskConflict?: boolean;
};

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function getAdminClient(request: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return { error: "Servera konfigurācijas kļūda.", status: 500 } as const;
  }

  const bearer = request.headers.get("authorization");
  const accessToken = bearer?.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!accessToken) {
    return { error: "Nav autorizācijas.", status: 401 } as const;
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } =
    await client.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return { error: "Nederīga sesija.", status: 401 } as const;
  }

  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();
  if (profile?.role !== "admin") {
    return {
      error: "Darba laikus drīkst labot tikai administrators.",
      status: 403,
    } as const;
  }

  return { client, adminId: authData.user.id } as const;
}

export async function GET(request: NextRequest) {
  const admin = await getAdminClient(request);
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const ownerId = request.nextUrl.searchParams.get("ownerId") || "";
  const date = request.nextUrl.searchParams.get("date") || "";
  if (!ownerId || !isDate(date)) {
    return NextResponse.json({ error: "Nederīgi pieprasījuma dati." }, { status: 400 });
  }

  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59.999`);
  const { data: workLogs, error: workError } = await admin.client
    .from("work_logs")
    .select("id, start_time, end_time")
    .eq("user_id", ownerId)
    .gte("start_time", dayStart.toISOString())
    .lte("start_time", dayEnd.toISOString())
    .order("start_time", { ascending: true });

  if (workError) {
    return NextResponse.json({ error: "Darba laiku neizdevās ielādēt." }, { status: 500 });
  }

  const workLogIds = (workLogs || []).map((row) => row.id);
  let corrections: unknown[] = [];
  if (workLogIds.length > 0) {
    const { data, error } = await admin.client
      .from("work_log_corrections")
      .select("id, work_log_id, action, previous_start_time, previous_end_time, new_start_time, new_end_time, created_at, changed_by")
      .in("work_log_id", workLogIds)
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: "Labojumu vēsturi neizdevās ielādēt." }, { status: 500 });
    }
    corrections = data || [];
  }

  return NextResponse.json({ workLogs: workLogs || [], corrections });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminClient(request);
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  let body: CorrectionBody;
  try {
    body = (await request.json()) as CorrectionBody;
  } catch {
    return NextResponse.json({ error: "Nederīgi pieprasījuma dati." }, { status: 400 });
  }

  const ownerId = body.ownerId || "";
  const date = body.date || "";
  const start = new Date(body.startTime || "");
  const end = new Date(body.endTime || "");
  if (
    !ownerId ||
    !isDate(date) ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return NextResponse.json({ error: "Aizpildi sākuma un beigu laiku." }, { status: 400 });
  }
  if (end <= start) {
    return NextResponse.json({ error: "Beigu laikam jābūt pēc sākuma laika." }, { status: 400 });
  }
  if (end.getTime() - start.getTime() > 36 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Darba diena nevar būt garāka par 36 stundām." }, { status: 400 });
  }

  const { data: owner } = await admin.client
    .from("profiles")
    .select("id")
    .eq("id", ownerId)
    .maybeSingle();
  if (!owner) {
    return NextResponse.json({ error: "Lietotājs nav atrasts." }, { status: 404 });
  }

  let previous: { id: number; start_time: string | null; end_time: string | null } | null = null;
  if (body.workLogId) {
    const { data } = await admin.client
      .from("work_logs")
      .select("id, start_time, end_time")
      .eq("id", body.workLogId)
      .eq("user_id", ownerId)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ error: "Darba dienas ieraksts nav atrasts." }, { status: 404 });
    }
    previous = data;
  }

  let overlapQuery = admin.client
    .from("work_logs")
    .select("id")
    .eq("user_id", ownerId)
    .lt("start_time", end.toISOString())
    .or(`end_time.is.null,end_time.gt.${start.toISOString()}`);
  if (body.workLogId) overlapQuery = overlapQuery.neq("id", body.workLogId);
  const { data: overlaps, error: overlapError } = await overlapQuery.limit(1);
  if (overlapError) {
    return NextResponse.json({ error: "Neizdevās pārbaudīt laiku pārklāšanos." }, { status: 500 });
  }
  if ((overlaps || []).length > 0) {
    return NextResponse.json({ error: "Šis laiks pārklājas ar citu lietotāja darba dienu." }, { status: 409 });
  }

  const taskQuery = admin.client
    .from("task_logs")
    .select("id, start_time, end_time")
    .eq("user_id", ownerId)
    .is("deleted_at", null);
  const { data: taskRows, error: taskError } = previous
    ? await taskQuery.eq("session_id", previous.id)
    : await taskQuery
        .gte("start_time", new Date(`${date}T00:00:00`).toISOString())
        .lte("start_time", new Date(`${date}T23:59:59.999`).toISOString());
  if (taskError) {
    return NextResponse.json({ error: "Neizdevās pārbaudīt uzdevumu laikus." }, { status: 500 });
  }

  const outsideTasks = (taskRows || []).filter((task) => {
    const taskStart = new Date(task.start_time);
    const taskEnd = task.end_time ? new Date(task.end_time) : null;
    return taskStart < start || !taskEnd || taskEnd > end;
  });
  if (outsideTasks.length > 0 && !body.confirmTaskConflict) {
    return NextResponse.json(
      {
        error: `${outsideTasks.length} uzdevuma laiks neiekļaujas norādītajā darba laikā.`,
        requiresConfirmation: true,
      },
      { status: 409 },
    );
  }

  const values = {
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  };
  const result = previous
    ? await admin.client
        .from("work_logs")
        .update(values)
        .eq("id", previous.id)
        .eq("user_id", ownerId)
        .select("id, start_time, end_time")
        .single()
    : await admin.client
        .from("work_logs")
        .insert({
          user_id: ownerId,
          project: "Darba diena",
          description: "Administratora izveidots ieraksts",
          ...values,
        })
        .select("id, start_time, end_time")
        .single();

  if (result.error || !result.data) {
    return NextResponse.json({ error: "Darba laiku neizdevās saglabāt." }, { status: 500 });
  }

  const { error: auditError } = await admin.client
    .from("work_log_corrections")
    .insert({
      work_log_id: result.data.id,
      owner_id: ownerId,
      changed_by: admin.adminId,
      action: previous ? "updated" : "created",
      previous_start_time: previous?.start_time || null,
      previous_end_time: previous?.end_time || null,
      new_start_time: result.data.start_time,
      new_end_time: result.data.end_time,
    });

  if (auditError) {
    if (previous) {
      await admin.client
        .from("work_logs")
        .update({ start_time: previous.start_time, end_time: previous.end_time })
        .eq("id", previous.id);
    } else {
      await admin.client.from("work_logs").delete().eq("id", result.data.id);
    }
    return NextResponse.json({ error: "Labojumu neizdevās reģistrēt vēsturē." }, { status: 500 });
  }

  return NextResponse.json({ workLog: result.data, taskWarningCount: outsideTasks.length });
}
