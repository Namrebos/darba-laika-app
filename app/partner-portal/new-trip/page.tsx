"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UnifiedTransportRequestForm from "@/app/components/UnifiedTransportRequestForm";
import type { PartnerPreset } from "@/app/request/[token]/RequestForm";
import { supabase } from "@/lib/supabaseClient";

export default function PartnerPortalNewTripPage() {
  const router = useRouter();
  const [preset, setPreset] = useState<PartnerPreset | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sourceRequestId, setSourceRequestId] = useState<number>();

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/partner-portal/login");
        return;
      }
      const response = await fetch("/api/partner-portal/session", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const result = await response.json();
      if (!response.ok || !result.partner?.profile_completed) {
        setError(result.error || "Partnera kartīte nav pilnībā aizpildīta.");
        setLoading(false);
        return;
      }
      const repeat = Number(new URLSearchParams(window.location.search).get("repeat"));
      if (Number.isSafeInteger(repeat) && repeat > 0) setSourceRequestId(repeat);
      setPreset({ valid: true, partner: result.partner, contacts: result.partner.contacts || [] });
      setLoading(false);
    }
    void load();
  }, [router]);

  if (loading) return <main className="min-h-screen bg-slate-50 p-6 text-center text-slate-600">Ielādē pieteikuma formu...</main>;
  if (error || !preset) return <main className="min-h-screen bg-slate-50 p-6 text-center text-red-700">{error || "Pieteikuma forma nav pieejama."}</main>;

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-5 text-slate-950 sm:px-6">
      <UnifiedTransportRequestForm
        mode="create"
        token=""
        initiallyValid
        partnerPreset={preset}
        sourceRequestId={sourceRequestId}
        partnerPortalRepeat={Boolean(sourceRequestId)}
        partnerPortal
      />
    </main>
  );
}
