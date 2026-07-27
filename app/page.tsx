// app/page.tsx

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { homeForProfile } from '@/lib/access'
import type { AccessProfile } from '@/lib/access'

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
        .select(`
          role,
          can_access_workday,
          can_access_finance,
          can_access_calculators,
          can_access_planned_tasks
        `)
        .eq('id', authData.user.id)
        .single()

      router.replace(
        homeForProfile({
          role: profile?.role || 'member',
          can_access_workday: profile?.can_access_workday === true,
          can_access_finance: profile?.can_access_finance === true,
          can_access_calculators: profile?.can_access_calculators === true,
          can_access_planned_tasks: profile?.can_access_planned_tasks === true,
        } as Pick<
          AccessProfile,
          | 'role'
          | 'can_access_workday'
          | 'can_access_finance'
          | 'can_access_calculators'
          | 'can_access_planned_tasks'
        >),
      )
    }

    redirect()
  }, [router])

  return null
}
