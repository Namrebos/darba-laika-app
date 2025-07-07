'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function ActualResetPasswordForm() {
  const params = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const handleReset = async () => {
    const { data, error } = await supabase.auth.updateUser({ password })

    if (error) {
      setMessage('❌ Neizdevās nomainīt paroli.')
    } else {
      setMessage('✅ Parole veiksmīgi nomainīta!')
    }
  }

  return (
    <main className="p-4 max-w-md mx-auto text-center">
      <h1 className="text-2xl font-bold mb-4">Paroles maiņa</h1>
      <p className="text-sm mb-6 text-gray-400">Reset token: {token}</p>

      <input
        type="password"
        placeholder="Jaunā parole"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full p-2 mb-4 border rounded"
      />

      <button
        onClick={handleReset}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Apstiprināt
      </button>

      {message && <p className="mt-4 text-sm">{message}</p>}
    </main>
  )
}
