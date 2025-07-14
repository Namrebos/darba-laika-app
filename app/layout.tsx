'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import { Menu, X, Sun, Moon } from 'lucide-react'
import './globals.css'


export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    setIsDarkMode(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode)
  }, [isDarkMode])

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navLinks = [
    { href: '/workday', label: 'Darbadiena' },
    { href: '/summary', label: 'Kopsavilkums' },
    { href: '/finance', label: 'Finanses' },
  ]

  return (
    <html lang="lv">
      <body className="bg-white dark:bg-zinc-900 text-black dark:text-white transition-colors">
        <div className="flex h-screen">
          {/* Sidebar */}
          <div className={`fixed inset-0 z-40 bg-black bg-opacity-50 transition-opacity ${sidebarOpen ? 'block' : 'hidden'}`} onClick={() => setSidebarOpen(false)} />
          <aside className={`fixed top-0 left-0 z-50 w-64 h-full bg-white dark:bg-zinc-800 shadow transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="flex justify-between items-center p-4 border-b border-zinc-300 dark:border-zinc-700">
              <h2 className="text-lg font-bold">Izvēlne</h2>
              <button onClick={() => setSidebarOpen(false)}><X size={24} /></button>
            </div>
            <nav className="flex flex-col p-4 space-y-4">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`text-base font-medium hover:underline ${pathname === href ? 'font-bold text-blue-600 dark:text-blue-400' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  {label}
                </Link>
              ))}
              <button
                onClick={toggleDarkMode}
                className="mt-4 flex items-center gap-2 text-sm bg-zinc-200 dark:bg-zinc-700 px-3 py-2 rounded"
              >
                {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                {isDarkMode ? 'Gaišais režīms' : 'Tumšais režīms'}
              </button>
              <button
                onClick={handleLogout}
                className="mt-auto text-red-600 hover:underline text-sm"
              >
                Izrakstīties
              </button>
            </nav>
          </aside>

          {/* Page Content */}
          <div className="flex-1 flex flex-col">
            <header className="flex items-center justify-between px-4 py-2 border-b bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-sm">
              <button onClick={() => setSidebarOpen(true)} className="text-zinc-800 dark:text-white">
                <Menu size={28} />
              </button>
              <h1 className="text-lg font-semibold">Darba Laika Aplikācija</h1>
              <div className="w-7" /> {/* empty block to balance flex */}
            </header>
            <main className="flex-1 overflow-y-auto p-4">{children}</main>
          </div>
        </div>
      </body>
    </html>
  )
}
