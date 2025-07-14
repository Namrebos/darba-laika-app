'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import { Menu, X, Sun, Moon, Laptop, Power } from 'lucide-react'
import './globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const [currentTime, setCurrentTime] = useState(new Date())
  const pathname = usePathname()
  const router = useRouter()

  const isAuthPage = pathname === '/login' || pathname === '/signup' || pathname === '/reset-password'

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const initial = saved || 'system'
    setTheme(initial)
    applyTheme(initial === 'system' ? (systemPrefersDark ? 'dark' : 'light') : initial)

    const listener = (e: MediaQueryListEvent) => {
      if (theme === 'system') {
        applyTheme(e.matches ? 'dark' : 'light')
      }
    }
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', listener)
    return () =>
      window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', listener)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const applyTheme = (mode: 'light' | 'dark') => {
    document.documentElement.classList.toggle('dark', mode === 'dark')
  }

  const changeTheme = (mode: 'light' | 'dark' | 'system') => {
    setTheme(mode)
    localStorage.setItem('theme', mode)
    if (mode === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      applyTheme(prefersDark ? 'dark' : 'light')
    } else {
      applyTheme(mode)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navLinks = [
    { href: '/workday', label: 'Darbadiena' },
    { href: '/summary', label: 'Kopsavilkums' },
    { href: '/finance', label: 'Finanses' },
  ]

  if (isAuthPage) {
    return (
      <html lang="lv">
        <body className="bg-white dark:bg-zinc-900 text-black dark:text-white transition-colors">
          <main className="min-h-screen flex items-center justify-center">
            {children}
          </main>
        </body>
      </html>
    )
  }

  return (
    <html lang="lv">
      <body className="bg-white dark:bg-zinc-900 text-black dark:text-white transition-colors">
        <div className="flex h-screen">
          {/* Overlay */}
          <div
            className={`fixed inset-0 z-40 bg-black bg-opacity-50 transition-opacity ${
              sidebarOpen ? 'block' : 'hidden'
            }`}
            onClick={() => setSidebarOpen(false)}
          />

          {/* Sidebar */}
          <aside
            className={`fixed top-0 left-0 z-50 w-64 h-full bg-white dark:bg-zinc-800 shadow transform transition-transform ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="flex justify-between items-center p-4 border-b border-zinc-300 dark:border-zinc-700">
              <h2 className="text-lg font-bold">Izvēlne</h2>
              <button onClick={() => setSidebarOpen(false)}>
                <X size={24} />
              </button>
            </div>
            <nav className="flex flex-col p-4 space-y-4 h-full">
              {/* Navigācija */}
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`text-base font-medium hover:underline ${
                    pathname === href ? 'font-bold text-blue-600 dark:text-blue-400' : ''
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  {label}
                </Link>
              ))}

              {/* Horizontāla strīpa */}
              <hr className="my-4 border-zinc-300 dark:border-zinc-700" />

              {/* Režīms */}
              <div>
                <p className="text-sm font-semibold mb-2">Režīms:</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => changeTheme('light')}
                    className={`p-2 rounded ${
                      theme === 'light'
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-200 dark:bg-zinc-700 text-black dark:text-white'
                    }`}
                    title="Gaišais režīms"
                  >
                    <Sun size={18} />
                  </button>
                  <button
                    onClick={() => changeTheme('dark')}
                    className={`p-2 rounded ${
                      theme === 'dark'
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-200 dark:bg-zinc-700 text-black dark:text-white'
                    }`}
                    title="Tumšais režīms"
                  >
                    <Moon size={18} />
                  </button>
                  <button
                    onClick={() => changeTheme('system')}
                    className={`p-2 rounded ${
                      theme === 'system'
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-200 dark:bg-zinc-700 text-black dark:text-white'
                    }`}
                    title="Sistēmas režīms"
                  >
                    <Laptop size={18} />
                  </button>
                </div>
              </div>

              {/* Logout */}
              <div className="mt-auto pt-10">
                <button
                  onClick={handleLogout}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded flex items-center justify-center"
                  title="Izrakstīties"
                >
                  <Power size={20} />
                </button>
              </div>
            </nav>
          </aside>

          {/* Page Content */}
          <div className="flex-1 flex flex-col">
            <header className="flex items-center justify-between px-4 py-2 border-b bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-sm">
              <button onClick={() => setSidebarOpen(true)} className="text-zinc-800 dark:text-white">
                <Menu size={28} />
              </button>
              <div className="text-center flex-1">
                <div className="text-xl font-bold">{currentTime.toLocaleDateString('lv-LV')}</div>
                <div className="text-2xl text-gray-500 dark:text-gray-400">{currentTime.toLocaleTimeString('lv-LV', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <div className="w-7" /> {/* Simetrijai */}
            </header>

            <main className="flex-1 overflow-y-auto p-4">{children}</main>
          </div>
        </div>
      </body>
    </html>
  )
}
