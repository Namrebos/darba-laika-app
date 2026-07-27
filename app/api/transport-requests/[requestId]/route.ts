import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  const adminClient = getSupabaseAdmin();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Servera savienojums nav konfigurēts." },
      { status: 500 },
    );
  }

  const bearer = request.headers.get("authorization");
  const accessToken = bearer?.startsWith("Bearer ") ? bearer.slice(7) : "";
  const { data: authData } = await adminClient.auth.getUser(accessToken);
  if (!authData.user) {
    return NextResponse.json({ error: "Nederīga sesija." }, { status: 401 });
  }

  const { requestId } = await context.params;
  const numericId = Number(requestId);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    return NextResponse.json(
      { error: "Pieteikums nav atrasts." },
      { status: 404 },
    );
  }

  const [{ data: profile }, { data: task }] = await Promise.all([
    adminClient
      .from("profiles")
      .select("role, can_access_planned_tasks")
      .eq("id", authData.user.id)
      .single(),
    adminClient
      .from("planned_tasks")
      .select("assignee_id, created_by")
      .eq("transport_request_id", numericId)
      .maybeSingle(),
  ]);

  const hasAccess =
    profile?.role === "admin" ||
    profile?.can_access_planned_tasks === true ||
    task?.assignee_id === authData.user.id ||
    task?.created_by === authData.user.id;
  if (!hasAccess) {
    return NextResponse.json({ error: "Nav pieejas." }, { status: 403 });
  }

  const [{ data: transportRequest, error }, { data: images }] =
    await Promise.all([
      adminClient
        .from("transport_requests")
        .select("*")
        .eq("id", numericId)
        .single(),
      adminClient
        .from("transport_request_images")
        .select("id, storage_path, file_name")
        .eq("request_id", numericId)
        .order("created_at"),
    ]);

  if (error || !transportRequest) {
    return NextResponse.json(
      { error: "Pieteikums nav atrasts." },
      { status: 404 },
    );
  }

  const imageRows = (images || []) as {
    id: number;
    storage_path: string;
    file_name: string;
  }[];
  const signedImages = await Promise.all(
    imageRows.map(async (image) => {
      const { data } = await adminClient.storage
        .from("transport-request-images")
        .createSignedUrl(image.storage_path, 60 * 60);
      return {
        id: image.id,
        fileName: image.file_name,
        url: data?.signedUrl || "",
      };
    }),
  );

  return NextResponse.json({
    request: transportRequest,
    images: signedImages.filter((image) => image.url),
  });
}
