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

  const { data: images } = await auth.client
    .from("transport_request_images")
    .select("storage_path")
    .eq("request_id", numericId);
  const { data: deleted, error } = await auth.client.rpc("delete_partner_new_request", {
    target_request_id: numericId,
    target_partner_id: auth.partnerId,
  });
  if (error || deleted !== true) {
    return NextResponse.json({ error: "Dzēst var tikai savu pieteikumu statusā “Jauns”." }, { status: 403 });
  }
  const paths = ((images || []) as Array<{ storage_path: string }>)
    .map((image) => image.storage_path)
    .filter(Boolean);
  if (paths.length) await auth.client.storage.from("transport-request-images").remove(paths);
  return NextResponse.json({ success: true });
}
