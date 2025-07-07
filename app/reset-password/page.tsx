'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [tokenChecked, setTokenChecked] = useState(false)

  useEffect(() => {
    const email = searchParams.get('email')
    const token = searchParams.get('token')
    const type = searchParams.get('type') || 'recovery'

    if (email && token) {
      supabase.auth
        .verifyOtp({ email, token, type: type as 'recovery' })
        .then(({ error }) => {
          if (error) {
            console.error(error)
            setMessage('❌ Derīguma termiņš beidzies vai saite nederīga')
          } else {
            setTokenChecked(true)
          }
        })
    } else {
      setMessage('❌ Trūkst parametri vai saite nederīga')
    }
  }, [searchParams])

  const handleReset = async () => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setMessage('❌ Neizdevās atjaunot paroli')
    } else {
      setMessage('✅ Parole atjaunota! Tiek pāradresēts...')
      setTimeout(() => router.push('/login'), 2000)
    }
  }

  return (
    <main className="max-w-md mx-auto mt-20 p-4 bg-zinc-900 rounded text-white text-center">
      <h1 className="text-2xl font-bold mb-6">🔐 Jaunas paroles ievade</h1>

      {tokenChecked ? (
        <>
          <input
            type="password"
            placeholder="Jaunā parole"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="p-2 rounded bg-zinc-800 border border-zinc-700 w-full mb-4"
          />
          <button
            onClick={handleReset}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded w-full"
          >
            Atjaunot paroli
          </button>
        </>
      ) : (
        <p>🔄 Notiek pārbaude...</p>
      )}

      {message && <p className="mt-4 text-sm">{message}</p>}
    </main>
  )
}
