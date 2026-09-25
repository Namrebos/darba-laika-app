"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function PartnerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError || !data.session) {
      setLoading(false);
      setError("E-pasts vai parole nav pareiza.");
      return;
    }
    const response = await fetch("/api/partner-portal/session", {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    setLoading(false);
    if (!response.ok) {
      await supabase.auth.signOut();
      setError("Šim kontam nav partnera portāla pieejas.");
      return;
    }
    router.replace("/partner-portal");
  }

  return (
    <form onSubmit={login} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-950 shadow-xl">
      <div>
        <h1 className="text-2xl font-bold">Partnera portāls</h1>
        <p className="mt-1 text-sm text-slate-500">Pieslēdzies, lai redzētu savus pieteikumus.</p>
      </div>
      <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-pasts" className="w-full rounded-xl border border-slate-300 p-3" />
      <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Parole" className="w-full rounded-xl border border-slate-300 p-3" />
      <button disabled={loading} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
        {loading ? "Pieslēdzas..." : "Ienākt"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
