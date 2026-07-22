// app/page.tsx

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { homeForRole } from '@/lib/access'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    async function redirect() {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) {
        router.replace('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single()

      router.replace(homeForRole(profile?.role || 'member'))
    }

    redirect()
  }, [router])

  return null
}
