import { createHash, randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";

export type SignerRole = "sender" | "recipient";

export function hashSigningToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSigningToken() {
  return randomBytes(32).toString("base64url");
}

export function dateInRiga(value: Date | string = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Riga",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function getAuthenticatedDeliveryNoteContext(
  accessToken: string,
  requestId: number,
) {
  const admin = getSupabaseAdmin();
  if (!admin) return { error: "Servera savienojums nav konfigurēts.", status: 500 } as const;
  const { data: authData } = await admin.auth.getUser(accessToken);
  if (!authData.user) return { error: "Nederīga sesija.", status: 401 } as const;

  const [{ data: profile }, { data: task }, { data: request }, { data: carrier }] = await Promise.all([
    admin.from("profiles").select("role, can_access_planned_tasks, can_access_workday").eq("id", authData.user.id).single(),
    admin.from("planned_tasks").select("assignee_id, created_by, vehicle_id, status").eq("transport_request_id", requestId).maybeSingle(),
    admin.from("transport_requests").select("*").eq("id", requestId).maybeSingle(),
    admin.from("carrier_settings").select("partner_type, first_name, last_name, company_name, registration_number, address, email").eq("id", "default").maybeSingle(),
  ]);
  if (!request) return { error: "Pieteikums nav atrasts.", status: 404 } as const;
  const allowed = profile?.role === "admin" || profile?.can_access_planned_tasks === true || profile?.can_access_workday === true || task?.assignee_id === authData.user.id || task?.created_by === authData.user.id;
  if (!allowed) return { error: "Nav pieejas.", status: 403 } as const;

  let vehicleNumber = "";
  if (task?.vehicle_id) {
    const { data: vehicle } = await admin.from("vehicles").select("registration_number").eq("id", task.vehicle_id).maybeSingle();
    vehicleNumber = String(vehicle?.registration_number || "");
  }
  const senderName = request.sender_type === "company"
    ? request.sender_company_name
    : [request.sender_first_name, request.sender_last_name].filter(Boolean).join(" ");
  const recipientName = request.recipient_type === "company"
    ? request.recipient_company_name
    : [request.recipient_first_name, request.recipient_last_name].filter(Boolean).join(" ");
  const carrierName = carrier?.partner_type === "company"
    ? carrier.company_name
    : [carrier?.first_name, carrier?.last_name].filter(Boolean).join(" ");
  const snapshot = {
    noteNumber: String(request.id),
    date: dateInRiga(),
    vehicleNumber,
    carrier: [carrierName, carrier?.registration_number ? `Reģ. Nr. ${carrier.registration_number}` : "", carrier?.address, carrier?.email].filter(Boolean).join("\n"),
    sender: [senderName, request.sender_registration_number ? `Reģ. Nr. ${request.sender_registration_number}` : "", request.sender_address].filter(Boolean).join("\n"),
    recipient: [recipientName, request.recipient_registration_number ? `Reģ. Nr. ${request.recipient_registration_number}` : ""].filter(Boolean).join("\n"),
    origin: request.pickup_address || "",
    destination: request.dropoff_address || "",
    cargo: request.cargo_type || "",
  };
  return { admin, user: authData.user, snapshot, taskStatus: task?.status || null } as const;
}
