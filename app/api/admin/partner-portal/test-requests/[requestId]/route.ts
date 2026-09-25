import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/partnerPortalServer";

export async function DELETE(request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth) return NextResponse.json({ error: "Nav pieejas." }, { status: 403 });
  const { requestId } = await context.params;
  const id = Number(requestId);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Testa pieteikums nav atrasts." }, { status: 404 });
  const { error } = await auth.client.from("partner_portal_test_requests").delete().eq("id", id).eq("created_by", auth.userId);
  if (error) return NextResponse.json({ error: "Testa pieteikumu neizdevās dzēst." }, { status: 500 });
  return NextResponse.json({ success: true });
}
