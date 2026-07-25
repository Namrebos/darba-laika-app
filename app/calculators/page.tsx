"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function CalculatorsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single();

      if (profile?.role !== "admin") {
        router.replace("/summary");
        return;
      }

      setAllowed(true);
    }

    checkAccess();
  }, [router]);

  if (!allowed) {
    return <p className="p-6 text-sm text-zinc-500">Pārbauda piekļuvi...</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">Kalkulatori</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Administratora aprēķinu rīki vienuviet.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
        <Calculator className="mx-auto mb-3 text-zinc-400" size={36} />
        <p className="font-medium">Kalkulatoru sadaļa ir gatava</p>
        <p className="mt-1 text-sm text-zinc-500">
          Nākamajā solī šeit pievienosim pirmo kalkulatoru.
        </p>
      </div>
    </div>
  );
}
