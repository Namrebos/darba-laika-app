import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validCoordinate(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

function validatePayload(input: Record<string, unknown>) {
  const senderType = input.sender_type;
  const recipientType = input.recipient_type;
  if (!["private", "company"].includes(String(senderType))) return false;
  if (!["private", "company"].includes(String(recipientType))) return false;

  const senderIdentity =
    senderType === "company"
      ? cleanText(input.sender_company_name, 120)
      : cleanText(input.sender_first_name, 60) &&
        cleanText(input.sender_last_name, 60);
  const recipientIdentity =
    recipientType === "company"
      ? cleanText(input.recipient_company_name, 120)
      : cleanText(input.recipient_first_name, 60) &&
        cleanText(input.recipient_last_name, 60);

  return Boolean(
    senderIdentity &&
      recipientIdentity &&
      cleanText(input.sender_phone, 30) &&
      cleanText(input.recipient_phone, 30) &&
      cleanText(input.pickup_address, 250) &&
      cleanText(input.dropoff_address, 250) &&
      cleanText(input.pickup_date, 10) &&
      cleanText(input.dropoff_date, 10) &&
      cleanText(input.cargo_type, 100) &&
      validCoordinate(input.pickup_lat, -90, 90) &&
      validCoordinate(input.pickup_lng, -180, 180) &&
      validCoordinate(input.dropoff_lat, -90, 90) &&
      validCoordinate(input.dropoff_lng, -180, 180)
  );
}

export async function GET(request: NextRequest) {
  const adminClient = getSupabaseAdmin();
  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  if (!adminClient || !token) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  const { data } = await adminClient
    .from("transport_request_links")
    .select("expires_at")
    .eq("token_hash", tokenHash(token))
    .is("submitted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  return NextResponse.json({
    valid: Boolean(data),
    expiresAt: data?.expires_at || null,
  });
}

export async function POST(request: NextRequest) {
  const adminClient = getSupabaseAdmin();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Pieteikumu iesniegšana serverī nav konfigurēta." },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const token = String(formData.get("token") || "").trim();
  const payloadText = String(formData.get("payload") || "");
  if (!token || !payloadText) {
    return NextResponse.json(
      { error: "Trūkst pieteikuma datu." },
      { status: 400 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadText) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Pieteikuma dati nav derīgi." },
      { status: 400 },
    );
  }

  if (!validatePayload(payload)) {
    return NextResponse.json(
      { error: "Aizpildi visus obligātos laukus un atzīmē abas vietas kartē." },
      { status: 400 },
    );
  }

  const files = formData
    .getAll("images")
    .filter((item): item is File => item instanceof File && item.size > 0);
  if (
    files.length > 8 ||
    files.some(
      (file) => file.size > 10 * 1024 * 1024 || !allowedTypes.has(file.type),
    )
  ) {
    return NextResponse.json(
      { error: "Atļauti ne vairāk kā 8 attēli, katrs līdz 10 MB." },
      { status: 400 },
    );
  }

  const safePayload = {
    sender_type: payload.sender_type,
    sender_first_name: cleanText(payload.sender_first_name, 60),
    sender_last_name: cleanText(payload.sender_last_name, 60),
    sender_company_name: cleanText(payload.sender_company_name, 120),
    sender_registration_number: cleanText(
      payload.sender_registration_number,
      30,
    ),
    sender_phone: cleanText(payload.sender_phone, 30),
    recipient_type: payload.recipient_type,
    recipient_first_name: cleanText(payload.recipient_first_name, 60),
    recipient_last_name: cleanText(payload.recipient_last_name, 60),
    recipient_company_name: cleanText(payload.recipient_company_name, 120),
    recipient_registration_number: cleanText(
      payload.recipient_registration_number,
      30,
    ),
    recipient_phone: cleanText(payload.recipient_phone, 30),
    pickup_address: cleanText(payload.pickup_address, 250),
    pickup_lat: Number(payload.pickup_lat),
    pickup_lng: Number(payload.pickup_lng),
    pickup_date: cleanText(payload.pickup_date, 10),
    pickup_time: cleanText(payload.pickup_time, 5),
    pickup_notes: cleanText(payload.pickup_notes, 500),
    dropoff_address: cleanText(payload.dropoff_address, 250),
    dropoff_lat: Number(payload.dropoff_lat),
    dropoff_lng: Number(payload.dropoff_lng),
    dropoff_date: cleanText(payload.dropoff_date, 10),
    dropoff_time: cleanText(payload.dropoff_time, 5),
    dropoff_notes: cleanText(payload.dropoff_notes, 500),
    cargo_type: cleanText(payload.cargo_type, 100),
    additional_notes: cleanText(payload.additional_notes, 500),
  };

  const { data, error } = await adminClient.rpc("submit_transport_request", {
    target_token_hash: tokenHash(token),
    payload: safePayload,
  });
  const submission = data as
    | { request_id?: number; planned_task_id?: number }
    | null;

  if (error || !submission?.request_id) {
    return NextResponse.json(
      {
        error: error?.message.includes("INVALID_REQUEST_LINK")
          ? "Pieteikuma saite nav derīga, ir izmantota vai tai beidzies termiņš."
          : "Pieteikumu neizdevās saglabāt.",
      },
      { status: 400 },
    );
  }

  let skippedImages = 0;
  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const storagePath = `${submission.request_id}/${randomBytes(16).toString("hex")}.${extension}`;
    const { error: uploadError } = await adminClient.storage
      .from("transport-request-images")
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      skippedImages += 1;
      continue;
    }

    const { error: imageError } = await adminClient
      .from("transport_request_images")
      .insert({
        request_id: submission.request_id,
        storage_path: storagePath,
        file_name: cleanText(file.name, 180) || "attels",
      });
    if (imageError) {
      skippedImages += 1;
      await adminClient.storage
        .from("transport-request-images")
        .remove([storagePath]);
    }
  }

  return NextResponse.json({
    success: true,
    skippedImages,
  });
}
