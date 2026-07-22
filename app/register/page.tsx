"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function RegistrationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function register(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email, password }),
    });
    const result = (await response.json()) as { error?: string };
    setLoading(false);

    if (!response.ok) {
      setMessage(result.error || "Reģistrācija neizdevās.");
      return;
    }

    router.replace("/login?registered=1");
  }

  if (!token) {
    return <p className="text-red-500">Uzaicinājuma saite nav derīga.</p>;
  }

  return (
    <form onSubmit={register} className="w-full max-w-sm space-y-4 rounded-lg bg-zinc-900 p-5 text-white">
      <div>
        <h1 className="text-xl font-bold">Konta izveide</h1>
        <p className="mt-1 text-sm text-zinc-400">Ievadi savu e-pastu un izveido paroli.</p>
      </div>
      <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-pasts" className="w-full rounded border border-zinc-700 bg-zinc-800 p-2" />
      <input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Parole (vismaz 8 zīmes)" className="w-full rounded border border-zinc-700 bg-zinc-800 p-2" />
      <button disabled={loading} className="w-full rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50">
        {loading ? "Izveido kontu..." : "Izveidot kontu"}
      </button>
      {message && <p className="text-sm text-red-400">{message}</p>}
    </form>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<p>Ielādē...</p>}>
      <RegistrationForm />
    </Suspense>
  );
}
