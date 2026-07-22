'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useSearchParams } from 'next/navigation'

export default function ResetPasswordForm() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const isInvitation = searchParams.get('invite') === '1'

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.updateUser({ password })

    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      router.push('/')
    }
  }

  return (
    <form onSubmit={handleResetPassword} className="max-w-sm mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">
        {isInvitation ? 'Konta aktivizēšana' : 'Jaunas paroles izveide'}
      </h1>
      {isInvitation && <p className="text-sm text-zinc-500">Izveido paroli, lai pabeigtu reģistrāciju.</p>}

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Jaunā parole"
        required
        className="w-full p-2 border rounded"
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
      >
        {loading ? 'Apstrādā...' : 'Saglabāt'}
      </button>

      {error && <p className="text-red-500 text-sm">{error}</p>}
    </form>
  )
}
