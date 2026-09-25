"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function PartnerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("passwordReset") === "1") {
      setMessage("Parole ir nomainīta. Tagad vari pieslēgties ar jauno paroli.");
      window.history.replaceState({}, "", "/partner-portal/login");
    }
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    if (mode === "reset") {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/partner-portal/reset-password`,
      });
      setLoading(false);
      if (resetError) {
        setError("Atjaunošanas saiti neizdevās nosūtīt. Mēģini vēlreiz pēc brīža.");
        return;
      }
      setMessage("Ja šis e-pasts ir reģistrēts, uz to ir nosūtīta paroles atjaunošanas saite.");
      return;
    }
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
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-950 shadow-xl">
      <div>
        <h1 className="text-2xl font-bold">{mode === "login" ? "Partnera portāls" : "Atjaunot paroli"}</h1>
        <p className="mt-1 text-sm text-slate-500">{mode === "login" ? "Pieslēdzies, lai redzētu savus pieteikumus." : "Ievadi partnera konta e-pastu."}</p>
      </div>
      <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-pasts" className="w-full rounded-xl border border-slate-300 p-3" />
      {mode === "login" && <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Parole" className="w-full rounded-xl border border-slate-300 p-3" />}
      <button disabled={loading} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
        {loading ? "Apstrādā..." : mode === "login" ? "Ienākt" : "Nosūtīt atjaunošanas saiti"}
      </button>
      <button type="button" onClick={() => { setMode((current) => current === "login" ? "reset" : "login"); setError(""); setMessage(""); }} className="w-full text-sm font-medium text-blue-700 underline">
        {mode === "login" ? "Aizmirsi paroli?" : "Atgriezties pie pieslēgšanās"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}
    </form>
  );
}
