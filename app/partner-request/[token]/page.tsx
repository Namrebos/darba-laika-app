import { createHash } from "crypto";
import RequestForm from "@/app/request/[token]/RequestForm";
import type { PartnerPreset } from "@/app/request/[token]/RequestForm";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";

export default async function PartnerRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let preset: PartnerPreset | null = null;
  const client = getSupabaseAdmin();
  if (client && token) {
    const hash = createHash("sha256").update(token).digest("hex");
    const { data: link } = await client.from("partner_request_links").select("partner_id").eq("token_hash", hash).eq("active", true).maybeSingle();
    if (link) {
      const partnerId = Number((link as { partner_id: number }).partner_id);
      const [{ data: partner }, { data: contacts }] = await Promise.all([
        client.from("partners").select("id, display_name, partner_type, first_name, last_name, company_name, registration_number, contact_name, address, latitude, longitude, phone, email").eq("id", partnerId).single(),
        client.from("partner_contacts").select("name, phone, sort_order").eq("partner_id", partnerId).order("sort_order").order("id"),
      ]);
      if (partner) preset = {
        valid: true,
        partner: partner as PartnerPreset["partner"],
        contacts: (contacts || []) as PartnerPreset["contacts"],
      };
    }
  }
  return <main className="min-h-screen bg-slate-50 px-3 py-5 text-slate-950 sm:px-6"><RequestForm token={token} initiallyValid={Boolean(preset?.valid)} partnerPreset={preset} /></main>;
}
