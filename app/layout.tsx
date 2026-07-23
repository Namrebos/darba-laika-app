"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { Menu, X, Sun, Moon, Laptop, Power } from "lucide-react";
import "./globals.css";
import ServiceWorkerRegister from "@/app/components/ServiceWorkerRegister";
import type { AppRole } from "@/lib/access";

type SummaryUser = {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [role, setRole] = useState<AppRole | null>(null);
  const [summaryUsers, setSummaryUsers] = useState<SummaryUser[]>([]);
  const [selectedSummaryUser, setSelectedSummaryUser] = useState("");
  const pathname = usePathname();
  const router = useRouter();

  const isAuthPage =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/register" ||
    pathname === "/reset-password";

  useEffect(() => {
    const saved = localStorage.getItem("theme") as
      | "light"
      | "dark"
      | "system"
      | null;
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const initial = saved || "system";
    setTheme(initial);
    applyTheme(
      initial === "system" ? (systemPrefersDark ? "dark" : "light") : initial,
    );

    const listener = (e: MediaQueryListEvent) => {
      if (theme === "system") {
        applyTheme(e.matches ? "dark" : "light");
      }
    };

    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", listener);

    return () =>
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    if (isAuthPage) return;

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
      const currentRole = (profile?.role || "member") as AppRole;
      setRole(currentRole);

      if (currentRole === "viewer" || currentRole === "admin") {
        const { data: allowedUsers } = await supabase.rpc("get_accessible_summary_users");
        const users = (allowedUsers || []) as SummaryUser[];
        const requestedUser = new URLSearchParams(window.location.search).get("user") || "";
        const selected = users.some((item) => item.id === requestedUser)
          ? requestedUser
          : users[0]?.id || "";
        setSummaryUsers(users);
        setSelectedSummaryUser(selected);
      }

      if (currentRole === "viewer" && !["/summary", "/profile"].includes(pathname)) {
        router.replace("/summary");
      }
      if (pathname === "/users" && currentRole !== "admin") {
        router.replace("/summary");
      }
    }

    checkAccess();
  }, [isAuthPage, pathname, router]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const applyTheme = (mode: "light" | "dark") => {
    document.documentElement.classList.toggle("dark", mode === "dark");
  };

  const changeTheme = (mode: "light" | "dark" | "system") => {
    setTheme(mode);
    localStorage.setItem("theme", mode);

    if (mode === "system") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      applyTheme(prefersDark ? "dark" : "light");
    } else {
      applyTheme(mode);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const navLinks = [
    { href: "/workday", label: "Darbadiena" },
    { href: "/summary", label: "Kopsavilkums" },
    { href: "/finance", label: "Finanses" },
    ...(role === "admin" ? [{ href: "/users", label: "Lietotāji" }] : []),
    { href: "/profile", label: "Profils" },
  ].filter(({ href }) => role !== "viewer" || ["/summary", "/profile"].includes(href));

  if (isAuthPage) {
    return (
      <html lang="lv">
        <body className="bg-white dark:bg-zinc-900 text-black dark:text-white transition-colors">
          <ServiceWorkerRegister />
          <main className="min-h-screen flex items-center justify-center">
            {children}
          </main>
        </body>
      </html>
    );
  }

  return (
    <html lang="lv">
      <body className="bg-white dark:bg-zinc-900 text-black dark:text-white transition-colors">
        <ServiceWorkerRegister />

        <div className="flex h-screen">
          <div
            className={`fixed inset-0 z-40 bg-black bg-opacity-50 transition-opacity ${
              sidebarOpen ? "block" : "hidden"
            }`}
            onClick={() => setSidebarOpen(false)}
          />

          <aside
            className={`fixed top-0 left-0 z-50 h-full w-64 transform bg-white shadow transition-transform dark:bg-zinc-800 ${
              sidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between border-b border-zinc-300 p-4 dark:border-zinc-700">
              <h2 className="text-lg font-bold">Izvēlne</h2>
              <button onClick={() => setSidebarOpen(false)}>
                <X size={24} />
              </button>
            </div>

            <nav className="flex h-full flex-col space-y-4 p-4">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`text-base font-medium hover:underline ${
                    pathname === href
                      ? "font-bold text-blue-600 dark:text-blue-400"
                      : ""
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  {label}
                </Link>
              ))}

              {(role === "viewer" || role === "admin") && (
                <div className="space-y-2 pl-2">
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    Skatīt lietotāju
                  </label>
                  {summaryUsers.length > 0 ? (
                    <select
                      value={selectedSummaryUser}
                      onChange={(event) => {
                        const userId = event.target.value;
                        setSelectedSummaryUser(userId);
                        window.location.href = `/summary?user=${encodeURIComponent(userId)}`;
                      }}
                      className="w-full rounded border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                    >
                      {summaryUsers.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.display_name || item.email || item.id}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-zinc-500">Admins vēl nav piešķīris piekļuvi.</p>
                  )}
                </div>
              )}

              <hr className="my-4 border-zinc-300 dark:border-zinc-700" />

              <div>
                <p className="mb-2 text-sm font-semibold">Režīms:</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => changeTheme("light")}
                    className={`rounded p-2 ${
                      theme === "light"
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-200 text-black dark:bg-zinc-700 dark:text-white"
                    }`}
                    title="Gaišais režīms"
                  >
                    <Sun size={18} />
                  </button>

                  <button
                    onClick={() => changeTheme("dark")}
                    className={`rounded p-2 ${
                      theme === "dark"
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-200 text-black dark:bg-zinc-700 dark:text-white"
                    }`}
                    title="Tumšais režīms"
                  >
                    <Moon size={18} />
                  </button>

                  <button
                    onClick={() => changeTheme("system")}
                    className={`rounded p-2 ${
                      theme === "system"
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-200 text-black dark:bg-zinc-700 dark:text-white"
                    }`}
                    title="Sistēmas režīms"
                  >
                    <Laptop size={18} />
                  </button>
                </div>
              </div>

              <div className="mt-auto pt-10">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center justify-center rounded bg-red-600 py-2 text-white hover:bg-red-700"
                  title="Izrakstīties"
                >
                  <Power size={20} />
                </button>
              </div>
            </nav>
          </aside>

          <div className="flex flex-1 flex-col">
            <header className="flex items-center justify-between border-b border-zinc-300 bg-white px-4 py-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <button
                onClick={() => setSidebarOpen(true)}
                className="text-zinc-800 dark:text-white"
              >
                <Menu size={28} />
              </button>

              <div className="flex-1 text-center">
                <div className="text-xl font-bold">
                  {currentTime.toLocaleDateString("lv-LV")}
                </div>
                <div className="text-2xl text-gray-500 dark:text-gray-400">
                  {currentTime.toLocaleTimeString("lv-LV", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>

              <div className="w-7" />
            </header>

            <main className="flex-1 overflow-y-auto p-4">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
