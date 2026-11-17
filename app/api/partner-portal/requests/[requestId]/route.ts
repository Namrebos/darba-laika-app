import { NextRequest, NextResponse } from "next/server";
import { getPartnerPortalSession } from "@/lib/partnerPortalServer";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  const auth = await getPartnerPortalSession(request);
  if (!auth) return NextResponse.json({ error: "Nav partnera pieejas." }, { status: 403 });
  const { requestId } = await context.params;
  const numericId = Number(requestId);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "Pieteikums nav atrasts." }, { status: 404 });
  }

  const [{ data: images }, { data: linkedTask }] = await Promise.all([
    auth.client
      .from("transport_request_images")
      .select("storage_path")
      .eq("request_id", numericId),
    auth.client
      .from("planned_tasks")
      .select("id, title, status, assignee_id")
      .eq("transport_request_id", numericId)
      .maybeSingle(),
  ]);
  const { data: deleted, error } = await auth.client.rpc("delete_partner_new_request", {
    target_request_id: numericId,
    target_partner_id: auth.partnerId,
  });
  if (error || deleted !== true) {
    return NextResponse.json({ error: "Dzēst var tikai savu pieteikumu statusā “Nosūtīts” vai “Plānots”." }, { status: 403 });
  }
  const paths = ((images || []) as Array<{ storage_path: string }>)
    .map((image) => image.storage_path)
    .filter(Boolean);
  if (paths.length) await auth.client.storage.from("transport-request-images").remove(paths);

  if (linkedTask) {
    const [{ data: profiles }, { data: preferences }] = await Promise.all([
      auth.client.from("profiles").select("id, role, can_access_planned_tasks"),
      auth.client
        .from("notification_preferences")
        .select("user_id")
        .eq("enabled", true)
        .eq("task_cancellations", true),
    ]);
    const optedIn = new Set((preferences || []).map((preference) => String(preference.user_id)));
    const recipients = (profiles || [])
      .filter((profile) =>
        optedIn.has(String(profile.id)) &&
        (profile.role === "admin" || profile.can_access_planned_tasks === true || String(profile.id) === String(linkedTask.assignee_id)),
      )
      .map((profile) => ({
        recipient_id: profile.id,
        notification_type: "partner_request_deleted",
        title: "Partneris dzēsa brauciena pieteikumu",
        body: String(linkedTask.title || "Brauciena pieteikums"),
        url: "/planned-tasks",
      }));
    if (recipients.length > 0) await auth.client.from("notification_queue").insert(recipients);
  }
  return NextResponse.json({ success: true });
}
