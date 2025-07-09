// Šis fails tiks aizstāts ar jauno versiju, kurā tiek implementēta statusa loģika, kas atbilst lietotāja definētajam UI plānam.

'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

export default function DataEntryPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())

  type WorkdayState = 'inactive' | 'active'
  type TaskState = 'none' | 'starting' | 'active' | 'finished' | 'review'

  const [workdayState, setWorkdayState] = useState<WorkdayState>('inactive')
  const [taskState, setTaskState] = useState<TaskState>('none')

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) router.push('/login')
      else {
        setUser(user)
        checkSession(user)
        setLoading(false)
      }
    }
    getUser()
  }, [])

  useEffect(() => {
    if (isSessionActive) setWorkdayState('active')
    else setWorkdayState('inactive')
  }, [isSessionActive])

  const checkSession = async (user: User) => {
    const { data, error } = await supabase
      .from('work_logs')
      .select('*')
      .eq('user_id', user.id)
      .is('end_time', null)
      .order('start_time', { ascending: false })
      .limit(1)

    setIsSessionActive(!error && data && data.length > 0)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const startWorkday = async () => {
    if (!user) return
    const { error } = await supabase.from('work_logs').insert([
      {
        user_id: user.id,
        project: 'Darba diena',
        start_time: new Date(),
        description: '',
      },
    ])
    if (!error) {
      setIsSessionActive(true)
      setWorkdayState('active')
    }
  }

  const endWorkday = async () => {
    if (!user) return

    const { data: tasks, error: taskError } = await supabase
      .from('task_logs')
      .select('*')
      .eq('user_id', user.id)
      .is('end_time', null)

    if (tasks && tasks.length > 0) {
      alert('Vispirms pabeidz visus uzdevumus!')
      return
    }

    const { data, error } = await supabase
      .from('work_logs')
      .select('*')
      .eq('user_id', user.id)
      .is('end_time', null)
      .order('start_time', { ascending: false })
      .limit(1)

    if (data && data.length > 0) {
      const id = data[0].id
      const { error: updateError } = await supabase
        .from('work_logs')
        .update({ end_time: new Date() })
        .eq('id', id)

      if (!updateError) {
        setIsSessionActive(false)
        setWorkdayState('inactive')
        setTaskState('none')
      }
    }
  }

  const renderTaskArea = () => {
    if (taskState === 'none') {
      return (
        <button
          onClick={() => setTaskState('starting')}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Jauns uzdevums
        </button>
      )
    }

    if (taskState === 'starting') {
      return (
        <button
          onClick={() => setTaskState('active')}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Sākt uzdevumu
        </button>
      )
    }

    if (taskState === 'active') {
      return (
        <div className="space-y-2">
          <input type="text" placeholder="Uzdevuma nosaukums" className="w-full border p-2" />
          <textarea placeholder="Piezīmes vai #tēmturi" className="w-full border p-2" />
          <div className="flex gap-4">
            <button onClick={() => setTaskState('finished')} className="bg-yellow-600 text-white px-4 py-2 rounded">Beigt uzdevumu</button>
            <input type="file" multiple accept="image/*" className="text-sm" />
          </div>
        </div>
      )
    }

    if (taskState === 'finished') {
      return (
        <div>
          <p className="font-bold">Uzdevuma nosaukums</p>
          <p className="text-sm text-gray-600">no 10:00 līdz 10:45</p>
          <button onClick={() => setTaskState('review')} className="text-blue-500 hover:underline">Apskats</button>
        </div>
      )
    }

    if (taskState === 'review') {
      return (
        <div>
          <h3 className="font-bold">Uzdevuma nosaukums</h3>
          <p>Piezīmes: ...</p>
          <div className="flex gap-2">[Attēli]</div>
          <button onClick={() => setTaskState('finished')} className="text-sm text-gray-500 hover:underline">Aizvērt</button>
        </div>
      )
    }

    return null
  }

  if (loading) return <div className="text-center p-10">Notiek ielāde...</div>

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <div className="text-xl font-bold">{currentTime.toLocaleDateString('lv-LV')}</div>
          <div className="text-sm text-gray-500">{currentTime.toLocaleTimeString('lv-LV')}</div>
        </div>
        <button
          onClick={logout}
          className="text-red-600 border border-red-600 px-4 py-1 rounded hover:bg-red-100"
        >
          Izlogoties
        </button>
      </div>

      <div className="border rounded p-4 space-y-4">
        <div className="flex gap-4">
          <button
            onClick={startWorkday}
            disabled={workdayState === 'active'}
            className={`px-4 py-2 rounded text-white ${workdayState === 'active' ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
          >
            Sākt
          </button>
          <button
            onClick={endWorkday}
            disabled={workdayState === 'inactive'}
            className={`px-4 py-2 rounded text-white ${workdayState === 'inactive' ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700'}`}
          >
            Pabeigt
          </button>
        </div>
      </div>

      {workdayState === 'active' && (
        <div className="border rounded p-4 space-y-4">
          {renderTaskArea()}
        </div>
      )}
    </div>
  )
}
