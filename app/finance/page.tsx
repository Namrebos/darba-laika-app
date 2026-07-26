"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function FinancePage() {
  const [eightHourWorkday, setEightHourWorkday] = useState(false);
  const [storageKey, setStorageKey] = useState("");

  useEffect(() => {
    async function loadSetting() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;

      const key = `finance-eight-hour-workday:${data.user.id}`;
      setStorageKey(key);
      setEightHourWorkday(localStorage.getItem(key) === "true");
    }

    loadSetting();
  }, []);

  function toggleEightHourWorkday(checked: boolean) {
    setEightHourWorkday(checked);
    if (storageKey) localStorage.setItem(storageKey, String(checked));
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <label className="flex items-center gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
        <input
          type="checkbox"
          checked={eightHourWorkday}
          onChange={(event) => toggleEightHourWorkday(event.target.checked)}
          className="h-5 w-5"
        />
        <span className="font-medium">8 stundu darbadiena</span>
      </label>
    </div>
  );
}
