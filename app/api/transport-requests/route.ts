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

function validInternationalPhone(value: unknown) {
  const compact = cleanText(value, 30).replace(/[\s()-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(compact);
}

function validDropoffOrder(input: Record<string, unknown>) {
  const pickupDate = cleanText(input.pickup_date, 10);
  const dropoffDate = cleanText(input.dropoff_date, 10);
  const pickupTime = cleanText(input.pickup_time, 5);
  const dropoffTime = cleanText(input.dropoff_time, 5);
  if (dropoffDate > pickupDate) return true;
  if (dropoffDate < pickupDate) return false;
  return !pickupTime || !dropoffTime || dropoffTime >= pickupTime;
}

function validatePayload(
  input: Record<string, unknown>,
  trustedPartnerRequest = false,
) {
  const senderType = input.sender_type;
  if (!["private", "company"].includes(String(senderType))) return false;
  const recipientType = input.recipient_type;
  if (!["private", "company"].includes(String(recipientType))) return false;

  const senderIdentity =
    senderType === "company"
      ? cleanText(input.sender_company_name, 120)
      : cleanText(input.sender_first_name, 60);
  const recipientIdentity =
    recipientType === "company"
      ? cleanText(input.recipient_company_name, 120)
      : cleanText(input.recipient_first_name, 60);
  return Boolean(
    senderIdentity &&
      recipientIdentity &&
      (trustedPartnerRequest || validInternationalPhone(input.sender_phone)) &&
      (trustedPartnerRequest || validInternationalPhone(input.recipient_phone)) &&
      cleanText(input.pickup_contact_name, 120) &&
      validInternationalPhone(input.pickup_contact_phone) &&
      cleanText(input.dropoff_contact_name, 120) &&
      validInternationalPhone(input.dropoff_contact_phone) &&
      cleanText(input.pickup_address, 250) &&
      cleanText(input.dropoff_address, 250) &&
      cleanText(input.pickup_date, 10) &&
      cleanText(input.dropoff_date, 10) &&
      cleanText(input.cargo_type, 100) &&
      validDropoffOrder(input) &&
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
  const internalRequest = formData.get("mode") === "internal";
  const token = String(formData.get("token") || "").trim();
  const partnerToken = String(formData.get("partner_token") || "").trim();
  const payloadText = String(formData.get("payload") || "");
  if ((!internalRequest && !token && !partnerToken) || !payloadText) {
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

  if (!validatePayload(payload, Boolean(partnerToken))) {
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

  const safePayload: Record<string, unknown> = {
    partner_id: null,
    sender_type: payload.sender_type,
    sender_first_name: cleanText(payload.sender_first_name, 60),
    sender_last_name: cleanText(payload.sender_last_name, 60),
    sender_company_name: cleanText(payload.sender_company_name, 120),
    sender_registration_number: cleanText(
      payload.sender_registration_number,
      30,
    ),
    sender_phone: cleanText(payload.sender_phone, 30),
    sender_address: cleanText(payload.sender_address, 250),
    sender_email: cleanText(payload.sender_email, 150),
    recipient_type: payload.recipient_type,
    recipient_first_name: cleanText(payload.recipient_first_name, 60),
    recipient_last_name: cleanText(payload.recipient_last_name, 60),
    recipient_company_name: cleanText(payload.recipient_company_name, 120),
    recipient_registration_number: cleanText(
      payload.recipient_registration_number,
      30,
    ),
    recipient_phone: cleanText(payload.recipient_phone, 30),
    pickup_contact_name: cleanText(payload.pickup_contact_name, 120),
    pickup_contact_phone: cleanText(payload.pickup_contact_phone, 30),
    dropoff_contact_name: cleanText(payload.dropoff_contact_name, 120),
    dropoff_contact_phone: cleanText(payload.dropoff_contact_phone, 30),
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

  let submissionTokenHash = token ? tokenHash(token) : "";
  if (internalRequest) {
    const bearer = request.headers.get("authorization");
    const accessToken = bearer?.startsWith("Bearer ") ? bearer.slice(7) : "";
    if (!accessToken) {
      return NextResponse.json({ error: "Nav autorizācijas." }, { status: 401 });
    }

    const { data: authData } = await adminClient.auth.getUser(accessToken);
    if (!authData.user) {
      return NextResponse.json({ error: "Nederīga sesija." }, { status: 401 });
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role, can_access_planned_tasks")
      .eq("id", authData.user.id)
      .single();
    if (
      profile?.role !== "admin" &&
      profile?.can_access_planned_tasks !== true
    ) {
      return NextResponse.json(
        { error: "Nav pieejas plānoto uzdevumu sadaļai." },
        { status: 403 },
      );
    }
    if (profile?.role === "admin") {
      const requestedPartnerId = Number(payload.partner_id);
      safePayload.partner_id = Number.isSafeInteger(requestedPartnerId) && requestedPartnerId > 0
        ? requestedPartnerId
        : null;
    }

    submissionTokenHash = tokenHash(randomBytes(32).toString("base64url"));
    const { error: linkError } = await adminClient
      .from("transport_request_links")
      .insert({
        token_hash: submissionTokenHash,
        created_by: authData.user.id,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
    if (linkError) {
      return NextResponse.json(
        { error: "Braucienu neizdevās sagatavot." },
        { status: 500 },
      );
    }
  } else if (partnerToken) {
    const { data: partnerLink } = await adminClient
      .from("partner_request_links")
      .select("partner_id, created_by")
      .eq("token_hash", tokenHash(partnerToken))
      .eq("active", true)
      .maybeSingle();
    if (!partnerLink) {
      return NextResponse.json({ error: "Partnera pieteikuma saite nav derīga." }, { status: 400 });
    }
    const persistentLink = partnerLink as { partner_id: number; created_by: string };
    const { data: partner } = await adminClient
      .from("partners")
      .select("id, partner_type, first_name, last_name, company_name, registration_number, address, phone, email")
      .eq("id", persistentLink.partner_id)
      .single();
    if (!partner) {
      return NextResponse.json({ error: "Partneris vairs nav pieejams." }, { status: 400 });
    }
    safePayload.partner_id = partner.id;
    safePayload.sender_type = partner.partner_type;
    safePayload.sender_first_name = partner.partner_type === "private" ? partner.first_name || "" : "";
    safePayload.sender_last_name = partner.partner_type === "private" ? partner.last_name || "" : "";
    safePayload.sender_company_name = partner.partner_type === "company" ? partner.company_name || "" : "";
    safePayload.sender_registration_number = partner.partner_type === "company" ? partner.registration_number || "" : "";
    safePayload.sender_phone = partner.phone || safePayload.sender_phone;
    safePayload.sender_address = partner.address;
    safePayload.sender_email = partner.email || "";

    submissionTokenHash = tokenHash(randomBytes(32).toString("base64url"));
    const { error: linkError } = await adminClient.from("transport_request_links").insert({
      token_hash: submissionTokenHash,
      created_by: persistentLink.created_by,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    if (linkError) {
      return NextResponse.json({ error: "Braucienu neizdevās sagatavot." }, { status: 500 });
    }
  }

  if (payload.recipient_same_as_sender === true) {
    safePayload.recipient_type = safePayload.sender_type;
    safePayload.recipient_first_name = safePayload.sender_first_name;
    safePayload.recipient_last_name = safePayload.sender_last_name;
    safePayload.recipient_company_name = safePayload.sender_company_name;
    safePayload.recipient_registration_number = safePayload.sender_registration_number;
    safePayload.recipient_phone = safePayload.sender_phone;
  }

  const { data, error } = await adminClient.rpc("submit_transport_request", {
    target_token_hash: submissionTokenHash,
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
