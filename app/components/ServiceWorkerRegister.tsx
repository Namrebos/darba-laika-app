"use client";

import { useCallback, useEffect, useState } from "react";
import { APP_VERSION } from "@/lib/appVersion";

type VersionResponse = {
  version?: string;
};

export default function ServiceWorkerRegister() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [message, setMessage] = useState("");

  const checkForUpdate = useCallback(async (manual = false) => {
    try {
      const response = await fetch(`/api/version?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Version check failed");

      const data = (await response.json()) as VersionResponse;
      const hasUpdate =
        Boolean(data.version) &&
        data.version !== "local" &&
        data.version !== APP_VERSION;

      setUpdateAvailable(hasUpdate);
      if (manual && !hasUpdate) {
        setMessage("Jums jau ir jaunākā lietotnes versija.");
      }
    } catch {
      if (manual) {
        setMessage("Neizdevās pārbaudīt atjauninājumus.");
      }
    }
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });

      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys
            .filter((key) => key.startsWith("darba-laiks-"))
            .forEach((key) => caches.delete(key));
        });
      }

      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch((error) =>
        console.error("Service worker registration failed:", error),
      );

    checkForUpdate();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    const handleManualCheck = () => checkForUpdate(true);

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleVisibility);
    window.addEventListener("app-check-for-updates", handleManualCheck);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleVisibility);
      window.removeEventListener("app-check-for-updates", handleManualCheck);
    };
  }, [checkForUpdate]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [message]);

  async function installUpdate() {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    }

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("darba-laiks-"))
          .map((key) => caches.delete(key)),
      );
    }

    window.location.reload();
  }

  if (!updateAvailable && !message) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-md rounded-xl border border-zinc-300 bg-white p-4 shadow-2xl dark:border-zinc-600 dark:bg-zinc-800">
      {updateAvailable ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">
            Pieejama jauna lietotnes versija.
          </p>
          <button
            type="button"
            onClick={installUpdate}
            className="shrink-0 rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Atjaunināt
          </button>
        </div>
      ) : (
        <p className="text-sm">{message}</p>
      )}
    </div>
  );
}
