import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";
import { hashSigningToken, sameTransportParties } from "@/lib/deliveryNoteServer";

async function getLink(token: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return { error: "Servera savienojums nav konfigurēts.", status: 500 } as const;
  const { data } = await admin.from("delivery_note_signing_links").select("id, delivery_note_id, signer_role, expires_at, used_at, revoked_at, delivery_notes(transport_request_id, document_snapshot)").eq("token_hash", hashSigningToken(token)).maybeSingle();
  const link = data as null | { id: string; delivery_note_id: string; signer_role: "sender" | "recipient"; expires_at: string; used_at: string | null; revoked_at: string | null; delivery_notes: unknown };
  if (!link || link.revoked_at || link.used_at || new Date(link.expires_at).getTime() <= Date.now()) {
    return { error: "Parakstīšanas saite nav derīga vai tās termiņš ir beidzies.", status: 410 } as const;
  }
  const joined = Array.isArray(link.delivery_notes) ? link.delivery_notes[0] : link.delivery_notes;
  const note = joined as { transport_request_id?: number; document_snapshot?: unknown } | null;
  const { data: transportRequest } = note?.transport_request_id
    ? await admin.from("transport_requests").select("sender_type, sender_first_name, sender_last_name, sender_company_name, sender_registration_number, recipient_type, recipient_first_name, recipient_last_name, recipient_company_name, recipient_registration_number").eq("id", note.transport_request_id).maybeSingle()
    : { data: null };
  return { admin, link, snapshot: note?.document_snapshot, sameParty: Boolean(transportRequest && sameTransportParties(transportRequest)) } as const;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const result = await getLink((await params).token);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ snapshot: result.snapshot, signerRole: result.link.signer_role, expiresAt: result.link.expires_at }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const result = await getLink(token);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const body = (await request.json()) as { signerName?: string; signatureData?: string };
  const signerName = String(body.signerName || "").trim();
  const signatureData = String(body.signatureData || "");
  if (!signerName || !signatureData.startsWith("data:image/png;base64,") || signatureData.length > 600000) {
    return NextResponse.json({ error: "Ievadi vārdu un parakstu." }, { status: 400 });
  }
  const prefix = result.link.signer_role === "sender" ? "sender" : "recipient";
  const now = new Date().toISOString();
  const { data: claimedLink } = await result.admin.from("delivery_note_signing_links").update({ used_at: now }).eq("id", result.link.id).is("used_at", null).is("revoked_at", null).select("id").maybeSingle();
  if (!claimedLink) return NextResponse.json({ error: "Šī parakstīšanas saite jau ir izmantota." }, { status: 410 });
  const signatureChanges: Record<string, string> = {
    [`${prefix}_signature_data`]: signatureData,
    [`${prefix}_signer_name`]: signerName,
    [`${prefix}_signed_at`]: now,
    updated_at: now,
  };
  if (result.sameParty) {
    signatureChanges.sender_signature_data = signatureData;
    signatureChanges.sender_signer_name = signerName;
    signatureChanges.sender_signed_at = now;
    signatureChanges.recipient_signature_data = signatureData;
    signatureChanges.recipient_signer_name = signerName;
    signatureChanges.recipient_signed_at = now;
  }
  const { error: signatureError } = await result.admin.from("delivery_notes").update(signatureChanges).eq("id", result.link.delivery_note_id);
  if (signatureError) {
    await result.admin.from("delivery_note_signing_links").update({ used_at: null }).eq("id", result.link.id);
    return NextResponse.json({ error: "Parakstu neizdevās saglabāt." }, { status: 400 });
  }
  if (result.sameParty) {
    await result.admin
      .from("delivery_note_signing_links")
      .update({ revoked_at: now })
      .eq("delivery_note_id", result.link.delivery_note_id)
      .neq("id", result.link.id)
      .is("used_at", null)
      .is("revoked_at", null);
  }
  return NextResponse.json({ ok: true });
}
