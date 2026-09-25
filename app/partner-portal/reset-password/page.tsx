"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function PartnerResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setSessionReady(true);
        setChecking(false);
      }
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSessionReady(Boolean(data.session));
      setChecking(false);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Parolei jābūt vismaz 8 zīmes garai.");
      return;
    }
    if (password !== confirmation) {
      setError("Abas paroles nesakrīt.");
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setLoading(false);
      setError("Paroli neizdevās nomainīt. Pieprasi jaunu atjaunošanas saiti.");
      return;
    }
    await supabase.auth.signOut();
    router.replace("/partner-portal/login?passwordReset=1");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4 text-slate-950">
      <form onSubmit={savePassword} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold">Izveidot jaunu paroli</h1>
          <p className="mt-1 text-sm text-slate-500">Jaunajai parolei jābūt vismaz 8 zīmes garai.</p>
        </div>
        {checking && <p className="text-sm text-slate-500">Pārbauda atjaunošanas saiti...</p>}
        {!checking && !sessionReady && (
          <div className="space-y-3">
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Atjaunošanas saite nav derīga vai tās termiņš ir beidzies.</p>
            <Link href="/partner-portal/login" className="inline-block text-sm font-medium text-blue-700 underline">Pieprasīt jaunu saiti</Link>
          </div>
        )}
        {sessionReady && <>
          <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Jaunā parole" className="w-full rounded-xl border border-slate-300 p-3" />
          <input type="password" required minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Atkārtoti ievadi paroli" className="w-full rounded-xl border border-slate-300 p-3" />
          <button disabled={loading} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{loading ? "Saglabā..." : "Saglabāt jauno paroli"}</button>
        </>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
