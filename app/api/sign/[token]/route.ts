import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";
import { hashSigningToken } from "@/lib/deliveryNoteServer";

async function getLink(token: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return { error: "Servera savienojums nav konfigurēts.", status: 500 } as const;
  const { data } = await admin.from("delivery_note_signing_links").select("id, delivery_note_id, signer_role, expires_at, used_at, revoked_at, delivery_notes(document_snapshot)").eq("token_hash", hashSigningToken(token)).maybeSingle();
  const link = data as null | { id: string; delivery_note_id: string; signer_role: "sender" | "recipient"; expires_at: string; used_at: string | null; revoked_at: string | null; delivery_notes: unknown };
  if (!link || link.revoked_at || link.used_at || new Date(link.expires_at).getTime() <= Date.now()) {
    return { error: "Parakstīšanas saite nav derīga vai tās termiņš ir beidzies.", status: 410 } as const;
  }
  const joined = Array.isArray(link.delivery_notes) ? link.delivery_notes[0] : link.delivery_notes;
  return { admin, link, snapshot: (joined as { document_snapshot?: unknown } | null)?.document_snapshot } as const;
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
  const { error: signatureError } = await result.admin.from("delivery_notes").update({
    [`${prefix}_signature_data`]: signatureData,
    [`${prefix}_signer_name`]: signerName,
    [`${prefix}_signed_at`]: now,
    updated_at: now,
  }).eq("id", result.link.delivery_note_id);
  if (signatureError) {
    await result.admin.from("delivery_note_signing_links").update({ used_at: null }).eq("id", result.link.id);
    return NextResponse.json({ error: "Parakstu neizdevās saglabāt." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
