import { NextRequest, NextResponse } from "next/server";
import { createSigningToken, dateInRiga, getAuthenticatedDeliveryNoteContext, hashSigningToken, type SignerRole } from "@/lib/deliveryNoteServer";

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

function snapshotDate(value: unknown) {
  if (!value || typeof value !== "object" || !("date" in value)) return null;
  const date = (value as { date?: unknown }).date;
  return typeof date === "string" ? date : null;
}

function createdDate(value: unknown) {
  return typeof value === "string" ? dateInRiga(value) : null;
}

async function contextFor(request: NextRequest, params: Promise<{ requestId: string }>) {
  const requestId = Number((await params).requestId);
  if (!Number.isSafeInteger(requestId) || requestId <= 0) return { error: "Pieteikums nav atrasts.", status: 404 } as const;
  return getAuthenticatedDeliveryNoteContext(bearer(request), requestId);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const context = await contextFor(request, params);
  if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const requestId = Number((await params).requestId);
  const { data: existing } = await context.admin.from("delivery_notes").select("id, document_snapshot, created_at, sender_signature_data, sender_signer_name, sender_signed_at, recipient_signature_data, recipient_signer_name, recipient_signed_at").eq("transport_request_id", requestId).maybeSingle();
  const existingDate = snapshotDate(existing?.document_snapshot);
  const originalCreatedDate = createdDate(existing?.created_at);
  const savedDate = existingDate
    ? existingDate
    : originalCreatedDate
      ? originalCreatedDate
      : context.snapshot.date;
  const snapshot = { ...context.snapshot, date: savedDate };
  const { data: note, error } = await context.admin.from("delivery_notes").upsert({
    transport_request_id: requestId,
    created_by: context.user.id,
    document_snapshot: snapshot,
    updated_at: new Date().toISOString(),
  }, { onConflict: "transport_request_id" }).select("sender_signature_data, sender_signer_name, sender_signed_at, recipient_signature_data, recipient_signer_name, recipient_signed_at").single();
  if (error) return NextResponse.json({ error: "Pavadzīmi neizdevās sagatavot." }, { status: 400 });
  return NextResponse.json({ snapshot, signatures: note || null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const context = await contextFor(request, params);
  if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const requestId = Number((await params).requestId);
  const body = (await request.json()) as { action?: string; signerRole?: SignerRole; signatureData?: string; signerName?: string };

  const { data: existing } = await context.admin.from("delivery_notes").select("document_snapshot, created_at").eq("transport_request_id", requestId).maybeSingle();
  const existingDate = snapshotDate(existing?.document_snapshot);
  const originalCreatedDate = createdDate(existing?.created_at);
  const savedDate = existingDate
    ? existingDate
    : originalCreatedDate
      ? originalCreatedDate
      : context.snapshot.date;
  const snapshot = { ...context.snapshot, date: savedDate };

  const { data: note, error: noteError } = await context.admin.from("delivery_notes").upsert({
    transport_request_id: requestId,
    created_by: context.user.id,
    document_snapshot: snapshot,
    updated_at: new Date().toISOString(),
  }, { onConflict: "transport_request_id" }).select("id").single();
  if (noteError || !note || typeof note.id !== "string") return NextResponse.json({ error: "Pavadzīmi neizdevās sagatavot." }, { status: 400 });
  const noteId = note.id;

  if (body.action === "save-signature") {
    if (!['sender', 'recipient'].includes(body.signerRole || '') || !body.signatureData?.startsWith("data:image/png;base64,") || body.signatureData.length > 600000) {
      return NextResponse.json({ error: "Nederīgs paraksts." }, { status: 400 });
    }
    const prefix = body.signerRole === "sender" ? "sender" : "recipient";
    const { error } = await context.admin.from("delivery_notes").update({
      [`${prefix}_signature_data`]: body.signatureData,
      [`${prefix}_signer_name`]: body.signerName?.trim() || null,
      [`${prefix}_signed_at`]: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", noteId);
    if (error) return NextResponse.json({ error: "Parakstu neizdevās saglabāt." }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action !== "create-link" || !['sender', 'recipient'].includes(body.signerRole || '')) {
    return NextResponse.json({ error: "Nederīga darbība." }, { status: 400 });
  }
  const signerRole: SignerRole = body.signerRole === "sender" ? "sender" : "recipient";
  const token = createSigningToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await context.admin.from("delivery_note_signing_links").update({ revoked_at: new Date().toISOString() }).eq("delivery_note_id", noteId).eq("signer_role", signerRole).is("used_at", null).is("revoked_at", null);
  const { error } = await context.admin.from("delivery_note_signing_links").insert({
    delivery_note_id: noteId,
    signer_role: signerRole,
    token_hash: hashSigningToken(token),
    expires_at: expiresAt,
    created_by: context.user.id,
  });
  if (error) return NextResponse.json({ error: "Parakstīšanas saiti neizdevās izveidot." }, { status: 400 });
  return NextResponse.json({ url: `${request.nextUrl.origin}/sign/${token}`, expiresAt });
}
