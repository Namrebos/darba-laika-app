import { NextRequest, NextResponse } from "next/server";
import { isValidInternationalPhone } from "@/lib/phoneInput";
import { getPartnerPortalSession } from "@/lib/partnerPortalServer";

type ContactInput = { name?: string; phone?: string };

export async function PUT(request: NextRequest) {
  const auth = await getPartnerPortalSession(request);
  if (!auth) return NextResponse.json({ error: "Nav partnera pieejas." }, { status: 403 });

  const body = await request.json() as Record<string, unknown>;
  const partnerType = body.partner_type === "private" ? "private" : "company";
  const displayName = String(body.display_name || "").trim();
  const firstName = String(body.first_name || "").trim();
  const lastName = String(body.last_name || "").trim();
  const companyName = String(body.company_name || "").trim();
  const registrationNumber = String(body.registration_number || "").trim();
  const address = String(body.address || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const contacts = (Array.isArray(body.contacts) ? body.contacts : []).map((item, index) => {
    const contact = item as ContactInput;
    return { name: String(contact.name || "").trim(), phone: String(contact.phone || "").replace(/\s/g, ""), sort_order: index };
  });
  const identityValid = partnerType === "company" ? Boolean(companyName && registrationNumber) : Boolean(firstName);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const locationValid = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  const contactsValid = contacts.length > 0 && contacts.every((contact) => contact.name && isValidInternationalPhone(contact.phone));
  if (!displayName || !identityValid || !address || !emailValid || !locationValid || !contactsValid) {
    return NextResponse.json({ error: "Aizpildi visus obligātos partnera kartītes laukus." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const firstContact = contacts[0];
  const { error: partnerError } = await auth.client.from("partners").update({
    display_name: displayName,
    partner_type: partnerType,
    first_name: partnerType === "private" ? firstName : null,
    last_name: partnerType === "private" ? lastName || null : null,
    company_name: partnerType === "company" ? companyName : null,
    registration_number: partnerType === "company" ? registrationNumber : null,
    contact_name: firstContact.name,
    phone: firstContact.phone,
    email,
    address,
    latitude,
    longitude,
    profile_completed: false,
    updated_at: now,
  }).eq("id", auth.partnerId);
  if (partnerError) return NextResponse.json({ error: "Partnera kartīti neizdevās saglabāt." }, { status: 500 });

  const { error: deleteError } = await auth.client.from("partner_contacts").delete().eq("partner_id", auth.partnerId);
  if (deleteError) return NextResponse.json({ error: "Kontaktpersonas neizdevās saglabāt." }, { status: 500 });
  const { error: contactError } = await auth.client.from("partner_contacts").insert(
    contacts.map((contact) => ({ ...contact, partner_id: auth.partnerId })),
  );
  if (contactError) return NextResponse.json({ error: "Kontaktpersonas neizdevās saglabāt." }, { status: 500 });

  const { error: completeError } = await auth.client.from("partners").update({
    profile_completed: true,
    updated_at: now,
  }).eq("id", auth.partnerId);
  if (completeError) return NextResponse.json({ error: "Partnera kartīti neizdevās pabeigt." }, { status: 500 });
  return NextResponse.json({ success: true });
}
