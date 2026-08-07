"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getOfflineWorkday } from "@/lib/offlineStore";
import { syncOfflineWorkday } from "@/lib/offlineSync";

export default function OfflineStatus() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let userId = "";
    const refresh = async () => {
      setOnline(navigator.onLine);
      const { data } = await supabase.auth.getSession();
      userId = data.session?.user.id || userId;
      const record = userId ? await getOfflineWorkday(userId) : undefined;
      setPending(Boolean(record && record.needsSync !== false));
    };
    const handleOnline = async () => {
      await refresh();
      if (userId) await syncOfflineWorkday(userId);
      await refresh();
    };
    const handleStatus = (event: Event) =>
      setSyncing(Boolean((event as CustomEvent).detail?.syncing));
    void refresh();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", refresh);
    window.addEventListener("offline-data-changed", refresh);
    window.addEventListener("offline-sync-complete", refresh);
    window.addEventListener("offline-sync-status", handleStatus);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("offline-data-changed", refresh);
      window.removeEventListener("offline-sync-complete", refresh);
      window.removeEventListener("offline-sync-status", handleStatus);
    };
  }, []);

  // Tiešsaistē sinhronizācija notiek fonā un netraucē darbu ar paziņojumu joslu.
  if (online) return null;
  return (
    <div className={`fixed inset-x-3 bottom-3 z-[110] mx-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-xl ${online ? "bg-amber-400 text-black" : "bg-zinc-900 text-white"}`}>
      {syncing ? <RefreshCw className="animate-spin" size={20} /> : <CloudOff size={20} />}
      <span>
        Bezsaistes režīms — dati tiek saglabāti ierīcē.
      </span>
    </div>
  );
}
