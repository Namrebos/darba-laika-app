// Pilns fails ar tagu saglabāšanu Supabase `tags` tabulā

'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { Menu } from 'lucide-react'

type Task = {
  id: string
  title: string
  notes: string
  tags: string[]
  images: File[]
  status: 'starting' | 'active' | 'finished' | 'review'
  startTime?: Date
  endTime?: Date
  isCall?: boolean
}

export default function DataEntryPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [workdayState, setWorkdayState] = useState<'inactive' | 'active'>('inactive')
  const [tasks, setTasks] = useState<Task[]>([])

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
    setWorkdayState(isSessionActive ? 'active' : 'inactive')
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
      addNewTask()
    }
  }

  const endWorkday = async () => {
    if (!user) return

    const { data: unfinishedTasks } = await supabase
      .from('task_logs')
      .select('*')
      .eq('user_id', user.id)
      .is('end_time', null)

    if (unfinishedTasks && unfinishedTasks.length > 0) {
      alert('Vispirms pabeidz visus uzdevumus!')
      return
    }

    const { data } = await supabase
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
        setTasks([])
      }
    }
  }

  const extractTags = (text: string): string[] => {
    const matches = text.match(/#\w+/g)
    return matches ? matches.map(t => t.toLowerCase()) : []
  }

  const extractAndSaveTags = async (title: string, notes: string): Promise<string[]> => {
    const tags = [...extractTags(title), ...extractTags(notes)]
    for (const tag of tags) {
      const { data, error } = await supabase
        .from('tags')
        .select('count')
        .eq('name', tag)
        .single()

      if (data) {
        await supabase
          .from('tags')
          .update({ count: data.count + 1 })
          .eq('name', tag)
      } else {
        await supabase
          .from('tags')
          .insert({ name: tag, count: 1 })
      }
    }
    return tags
  }

  const addNewTask = (isCall = false) => {
    const newTask: Task = {
      id: crypto.randomUUID(),
      title: '',
      notes: '',
      tags: ['#projekts'],
      images: [],
      status: 'starting',
      isCall,
    }
    setTasks((prev) => [...prev, newTask])
  }

  const updateTask = (id: string, updated: Partial<Task>) => {
    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, ...updated } : task))
    )
  }

  const renderTask = (task: Task) => {
    if (task.status === 'starting') {
      return (
        <button
          onClick={() => updateTask(task.id, { status: 'active', startTime: new Date() })}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Sākt uzdevumu
        </button>
      )
    }

    const renderTaskForm = (readonly: boolean) => (
      <div className="space-y-4 border p-4 rounded">
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Uzdevuma nosaukums"
            className="flex-1 border p-2 rounded"
            value={task.title}
            onChange={(e) => !readonly && updateTask(task.id, { title: e.target.value })}
            readOnly={readonly}
          />
          {!readonly && (
            <button
              onClick={async () => {
                const titleFilled = task.title.trim().length > 0
                const notesFilled = task.notes.trim().length > 0

                if (!titleFilled && !notesFilled) {
                  const shouldDelete = window.confirm(
                    'Uzdevums netiks saglabāts.\n\nVai dzēst šo uzdevumu?'
                  )
                  if (shouldDelete) {
                    setTasks((prev) => prev.filter((t) => t.id !== task.id))
                  }
                  return
                }

                if (!titleFilled || !notesFilled) {
                  alert('Lūdzu aizpildi gan uzdevuma nosaukumu, gan piezīmes!')
                  return
                }

                const tags = await extractAndSaveTags(task.title, task.notes)

                updateTask(task.id, {
                  tags,
                  status: 'finished',
                  endTime: new Date(),
                })
              }}
              className="bg-red-600 text-white px-4 py-2 rounded"
            >
              Pabeigt
            </button>
          )}
        </div>

        <div className="flex gap-4">
          <textarea
            placeholder="Piezīmes"
            className="w-1/2 border p-2 rounded h-28"
            value={task.notes}
            onChange={(e) => !readonly && updateTask(task.id, { notes: e.target.value })}
            readOnly={readonly}
          />
          <div className="w-1/2 border p-2 rounded min-h-[7rem]">
            {task.tags.map((tag, idx) => (
              <span key={idx} className="text-sm text-gray-600 mr-2">{tag}</span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {!readonly && (
            <label className="bg-cyan-500 text-white px-4 py-2 rounded cursor-pointer">
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    const files = Array.from(e.target.files)
                    updateTask(task.id, { images: [...task.images, ...files] })
                  }
                }}
              />
              Pievienot attēlus
            </label>
          )}
          <div className="flex gap-2">
            {task.images.map((_, idx) => (
              <div key={idx} className="w-12 h-12 bg-yellow-400 rounded" />
            ))}
          </div>
        </div>

        {readonly && (
          <button
            className="text-sm text-gray-600 underline"
            onClick={() => updateTask(task.id, { status: 'finished' })}
          >
            Aizvērt
          </button>
        )}
      </div>
    )

    if (task.status === 'active') return renderTaskForm(false)
    if (task.status === 'review') return renderTaskForm(true)

    if (task.status === 'finished') {
      const start = task.startTime ? new Date(task.startTime) : null
      const end = task.endTime ? new Date(task.endTime) : null
      let durationText = ''
      if (start && end) {
        const duration = Math.floor((end.getTime() - start.getTime()) / 60000)
        const hours = Math.floor(duration / 60)
        const minutes = duration % 60
        durationText = `${hours}h ${minutes}min`
      }

      return (
        <div className="border p-4 rounded bg-gray-100 space-y-2">
          <h3 className="font-bold">{task.title}</h3>
          {start && end && (
            <p className="text-sm text-gray-600">
              no {start.toLocaleTimeString('lv-LV')} līdz {end.toLocaleTimeString('lv-LV')} ({durationText})
            </p>
          )}
          <button
            className="text-blue-600 underline text-sm"
            onClick={() => updateTask(task.id, { status: 'review' })}
          >
            Apskats
          </button>
        </div>
      )
    }

    return null
  }

  if (loading) return <div className="text-center p-10">Notiek ielāde...</div>

  const finishedTasks = tasks.filter((t) => t.status === 'finished' && !t.isCall)
  const callTasks = tasks.filter((t) => t.isCall)

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex justify-between items-center border-b pb-2">
        <button className="text-black">
          <Menu size={32} />
        </button>
        <div className="text-center flex-1">
          <div className="text-2xl font-bold">
            {currentTime.toLocaleDateString('lv-LV')}
          </div>
          <div className="text-xl text-gray-400">
            {currentTime.toLocaleTimeString('lv-LV')}
          </div>
        </div>
        <button
          onClick={logout}
          className="text-red-600 border border-red-600 px-4 py-1 rounded hover:bg-red-100"
        >
          Izlogoties
        </button>
      </div>

      <div className="border rounded p-4 space-y-4">
        <div className="flex justify-between">
          <button
            onClick={startWorkday}
            disabled={workdayState === 'active'}
            className={`px-4 py-2 rounded text-white ${workdayState === 'active' ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
          >
            Sākt darbadienu
          </button>
          <button
            onClick={endWorkday}
            disabled={workdayState === 'inactive'}
            className={`px-4 py-2 rounded text-white ${workdayState === 'inactive' ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700'}`}
          >
            Pabeigt darbadienu
          </button>
        </div>
      </div>

      {workdayState === 'active' && (
        <div className="space-y-6">
          {tasks.filter(t => !t.isCall).map((task) => (
            <div key={task.id}>{renderTask(task)}</div>
          ))}
          {(() => {
            const nonCallTasks = tasks.filter(t => !t.isCall)
            const last = nonCallTasks[nonCallTasks.length - 1]
            const canAdd =
              nonCallTasks.length === 0 || (
                last &&
                (last.status === 'active' || last.status === 'finished') &&
                last.title.trim().length > 0 &&
                last.notes.trim().length > 0
              )

            return canAdd ? (
              <div>
                <button
                  onClick={() => addNewTask(false)}
                  className="bg-green-600 text-white px-4 py-2 rounded"
                >
                  Sākt uzdevumu
                </button>
              </div>
            ) : null
          })()}
        </div>
      )}

      {callTasks.length > 0 && (
        <div className="border-t pt-4 space-y-6">
          {callTasks.map((task) => (
            <div key={task.id}>{renderTask(task)}</div>
          ))}
        </div>
      )}

      <div className="pt-6 border-t">
        {(() => {
          const lastCall = callTasks[callTasks.length - 1]
          const canAddCall =
            callTasks.length === 0 || (
              lastCall &&
              lastCall.status === 'finished' &&
              lastCall.title.trim().length > 0 &&
              lastCall.notes.trim().length > 0
            )

          return canAddCall ? (
            <button
              onClick={() => addNewTask(true)}
              className="bg-red-400 text-black px-6 py-2 rounded font-semibold"
            >
              Izsaukums
            </button>
          ) : null
        })()}
      </div>
    </div>
  )
}
