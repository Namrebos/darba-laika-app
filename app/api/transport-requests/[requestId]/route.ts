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
      .select("assignee_id, created_by, vehicle_id")
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
    vehicleId: task?.vehicle_id || null,
    images: signedImages.filter((image) => image.url),
  });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  const adminClient = getSupabaseAdmin();
  if (!adminClient) {
    return NextResponse.json({ error: "Servera savienojums nav konfigurēts." }, { status: 500 });
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
    return NextResponse.json({ error: "Pieteikums nav atrasts." }, { status: 404 });
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role, can_access_planned_tasks")
    .eq("id", authData.user.id)
    .single();
  if (profile?.role !== "admin" && profile?.can_access_planned_tasks !== true) {
    return NextResponse.json({ error: "Nav tiesību rediģēt pieteikumu." }, { status: 403 });
  }

  const payload = (await request.json()) as Record<string, unknown>;
  const text = (key: string) => String(payload[key] ?? "").trim();
  const nullableText = (key: string) => text(key) || null;
  const number = (key: string) => Number(payload[key]);
  const senderType = text("sender_type");
  const recipientType = text("recipient_type");
  const pickupLat = number("pickup_lat");
  const pickupLng = number("pickup_lng");
  const dropoffLat = number("dropoff_lat");
  const dropoffLng = number("dropoff_lng");

  const senderName = senderType === "company"
    ? text("sender_company_name")
    : text("sender_first_name");
  const recipientName = recipientType === "company"
    ? text("recipient_company_name")
    : text("recipient_first_name");
  if (
    !["private", "company"].includes(senderType) ||
    !["private", "company"].includes(recipientType) ||
    !senderName || !recipientName || !text("sender_phone") ||
    !text("recipient_phone") || !text("pickup_address") ||
    !text("pickup_contact_name") || !text("pickup_contact_phone") ||
    !text("dropoff_contact_name") || !text("dropoff_contact_phone") ||
    !text("dropoff_address") || !text("pickup_date") ||
    !text("dropoff_date") || !text("cargo_type") ||
    !Number.isFinite(pickupLat) || !Number.isFinite(pickupLng) ||
    !Number.isFinite(dropoffLat) || !Number.isFinite(dropoffLng)
  ) {
    return NextResponse.json({ error: "Aizpildi obligātos pieteikuma laukus." }, { status: 400 });
  }
  const pickupMoment = `${text("pickup_date")}T${text("pickup_time") || "00:00"}`;
  const dropoffMoment = `${text("dropoff_date")}T${text("dropoff_time") || "23:59"}`;
  if (dropoffMoment < pickupMoment) {
    return NextResponse.json(
      { error: "Izkraušanas datums un laiks nevar būt pirms uzkraušanas." },
      { status: 400 },
    );
  }

  const changes = {
    sender_type: senderType,
    sender_first_name: nullableText("sender_first_name"),
    sender_last_name: nullableText("sender_last_name"),
    sender_company_name: nullableText("sender_company_name"),
    sender_registration_number: nullableText("sender_registration_number"),
    sender_phone: text("sender_phone"),
    recipient_type: recipientType,
    recipient_first_name: nullableText("recipient_first_name"),
    recipient_last_name: nullableText("recipient_last_name"),
    recipient_company_name: nullableText("recipient_company_name"),
    recipient_registration_number: nullableText("recipient_registration_number"),
    recipient_phone: text("recipient_phone"),
    pickup_contact_name: text("pickup_contact_name"),
    pickup_contact_phone: text("pickup_contact_phone"),
    dropoff_contact_name: text("dropoff_contact_name"),
    dropoff_contact_phone: text("dropoff_contact_phone"),
    pickup_address: text("pickup_address"),
    pickup_lat: pickupLat,
    pickup_lng: pickupLng,
    pickup_date: text("pickup_date"),
    pickup_time: nullableText("pickup_time"),
    pickup_notes: text("pickup_notes"),
    dropoff_address: text("dropoff_address"),
    dropoff_lat: dropoffLat,
    dropoff_lng: dropoffLng,
    dropoff_date: text("dropoff_date"),
    dropoff_time: nullableText("dropoff_time"),
    dropoff_notes: text("dropoff_notes"),
    cargo_type: text("cargo_type"),
    additional_notes: text("additional_notes"),
    updated_at: new Date().toISOString(),
  };

  const { data: updatedRequest, error } = await adminClient
    .from("transport_requests")
    .update(changes)
    .eq("id", numericId)
    .select("*")
    .single();
  if (error || !updatedRequest) {
    return NextResponse.json({ error: "Pieteikumu neizdevās saglabāt." }, { status: 400 });
  }

  let taskTitle = senderType === "company"
    ? text("sender_company_name")
    : [text("sender_first_name"), text("sender_last_name")].filter(Boolean).join(" ");
  if (updatedRequest.partner_id) {
    const { data: partner } = await adminClient
      .from("partners")
      .select("display_name")
      .eq("id", updatedRequest.partner_id)
      .maybeSingle();
    const partnerDisplayName = String(partner?.display_name || "").trim();
    if (partnerDisplayName) taskTitle = partnerDisplayName;
  }
  const taskNote = [text("cargo_type"), text("additional_notes")].filter(Boolean).join("\n");
  await adminClient
    .from("planned_tasks")
    .update({
      title: taskTitle,
      note: taskNote,
      scheduled_date: text("pickup_date"),
      scheduled_time: nullableText("pickup_time"),
      updated_at: new Date().toISOString(),
    })
    .eq("transport_request_id", numericId);

  return NextResponse.json({ request: updatedRequest });
}
