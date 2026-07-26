'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'reset'>('login')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setMessage('')

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setMessage('❌ Neizdevās ielogoties')
      } else {
        router.push('/')
      }
    } else if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://tavs-vercel-domeins.vercel.app/reset-password' // <-- šeit nomaini uz reālo domēnu
      })
      if (error) {
        setMessage('❌ Neizdevās nosūtīt paroles atjaunošanas saiti')
      } else {
        setMessage('✅ E-pasts ar atjaunošanas saiti nosūtīts!')
      }
    }
  }

  return (
    <main className="max-w-md mx-auto mt-20 p-4 bg-zinc-900 rounded text-white text-center">
      <h1 className="text-2xl font-bold mb-6">
        {mode === 'login' ? 'Ienākt' : 'Atjaunot paroli'}
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="email"
          placeholder="E-pasts"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="p-2 rounded bg-zinc-800 border border-zinc-700"
        />

        {mode !== 'reset' && (
          <input
            type="password"
            placeholder="Parole"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="p-2 rounded bg-zinc-800 border border-zinc-700"
          />
        )}

        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded"
        >
          {mode === 'login' ? 'Ienākt' : 'Nosūtīt saiti'}
        </button>
      </form>

      {message && <p className="mt-4 text-sm">{message}</p>}

      <div className="mt-6 space-y-2 text-sm">
        {mode !== 'login' && (
          <p className="cursor-pointer text-blue-400" onClick={() => setMode('login')}>
            🔐 Jau ir konts? Ieiet
          </p>
        )}
        {mode !== 'reset' && (
          <p className="cursor-pointer text-blue-400" onClick={() => setMode('reset')}>
            ❓ Aizmirsi paroli?
          </p>
        )}
      </div>
      <p className="mt-6 text-xs text-zinc-400">Jaunus kontus var izveidot tikai ar administratora uzaicinājumu.</p>
    </main>
  )
}
