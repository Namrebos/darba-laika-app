"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function RegisterForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function register(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/partner-portal/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email, password }),
    });
    const result = (await response.json()) as { error?: string };
    setLoading(false);
    if (!response.ok) {
      setError(result.error || "Kontu neizdevās izveidot.");
      return;
    }
    router.replace("/partner-portal/login");
  }

  return (
    <form onSubmit={register} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-950 shadow-xl">
      <div>
        <h1 className="text-2xl font-bold">Izveidot partnera kontu</h1>
        <p className="mt-1 text-sm text-slate-500">Vienam partnerim tiek izveidots viens konts.</p>
      </div>
      {!token && <p className="text-sm text-red-600">Reģistrācijas saite nav derīga.</p>}
      <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-pasts" className="w-full rounded-xl border border-slate-300 p-3" />
      <input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Parole (vismaz 8 zīmes)" className="w-full rounded-xl border border-slate-300 p-3" />
      <button disabled={loading || !token} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
        {loading ? "Izveido kontu..." : "Izveidot kontu"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

export default function PartnerRegisterPage() {
  return <Suspense fallback={<p>Ielādē...</p>}><RegisterForm /></Suspense>;
}
