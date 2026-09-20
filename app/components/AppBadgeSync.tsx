"use client";

import { useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { updateAppBadge } from "@/lib/appBadge";

export default function AppBadgeSync() {
  const syncBadge = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      await updateAppBadge(0);
      return;
    }

    const { count, error } = await supabase
      .from("planned_tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .is("viewed_at", null);

    if (!error) await updateAppBadge(count || 0);
  }, []);

  useEffect(() => {
    void syncBadge();

    const channel = supabase
      .channel("app-badge-planned-tasks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "planned_tasks" },
        () => void syncBadge(),
      )
      .subscribe();

    const handleRefresh = () => void syncBadge();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void syncBadge();
    };
    const interval = window.setInterval(syncBadge, 60_000);

    window.addEventListener("app-badge-refresh", handleRefresh);
    window.addEventListener("online", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("app-badge-refresh", handleRefresh);
      window.removeEventListener("online", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibility);
      void supabase.removeChannel(channel);
    };
  }, [syncBadge]);

  return null;
}
