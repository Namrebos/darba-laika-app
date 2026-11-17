import { NextRequest, NextResponse } from "next/server";
import { getPartnerPortalSession } from "@/lib/partnerPortalServer";

function draftId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(request: NextRequest, context: { params: Promise<{ draftId: string }> }) {
  const auth = await getPartnerPortalSession(request);
  if (!auth) return NextResponse.json({ error: "Nav partnera pieejas." }, { status: 403 });
  const id = draftId((await context.params).draftId);
  if (!id) return NextResponse.json({ error: "Melnraksts nav atrasts." }, { status: 404 });
  const { data } = await auth.client
    .from("partner_request_drafts")
    .select("id, payload")
    .eq("id", id)
    .eq("partner_id", auth.partnerId)
    .eq("created_by", auth.userId)
    .maybeSingle();
  return data
    ? NextResponse.json({ draft: data })
    : NextResponse.json({ error: "Melnraksts nav atrasts." }, { status: 404 });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ draftId: string }> }) {
  const auth = await getPartnerPortalSession(request);
  if (!auth) return NextResponse.json({ error: "Nav partnera pieejas." }, { status: 403 });
  const id = draftId((await context.params).draftId);
  if (!id) return NextResponse.json({ error: "Melnraksts nav atrasts." }, { status: 404 });
  const { error } = await auth.client
    .from("partner_request_drafts")
    .delete()
    .eq("id", id)
    .eq("partner_id", auth.partnerId)
    .eq("created_by", auth.userId);
  if (error) return NextResponse.json({ error: "Melnrakstu neizdevās dzēst." }, { status: 500 });
  return NextResponse.json({ success: true });
}
