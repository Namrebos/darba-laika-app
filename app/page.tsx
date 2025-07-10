// page.tsx

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
  uploadedImageUrls: string[]
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
  const [tagLibrary, setTagLibrary] = useState<string[]>([])
  const [activeInput, setActiveInput] = useState<'title' | 'notes' | null>(null)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [savingTasks, setSavingTasks] = useState<Record<string, boolean>>({})

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
        loadTags(user.id)
        setLoading(false)
      }
    }
    getUser()
  }, [])

  const loadTags = async (userId: string) => {
    const { data } = await supabase
      .from('tags')
      .select('name')
      .eq('user_id', userId)
      .order('usage_count', { ascending: false })

    if (data) {
      const names = data.map(row => row.name)
      setTagLibrary(names)
    }
  }

  const checkSession = async (user: User) => {
    const { data } = await supabase
      .from('work_logs')
      .select('*')
      .eq('user_id', user.id)
      .is('end_time', null)
      .order('start_time', { ascending: false })
      .limit(1)

    if (data && data.length > 0) {
      setIsSessionActive(true)
      setSessionId(data[0].id)
    } else {
      setIsSessionActive(false)
    }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const startWorkday = async () => {
    if (!user) return
    const { data } = await supabase.from('work_logs').insert([
      {
        user_id: user.id,
        project: 'Darba diena',
        start_time: new Date(),
        description: '',
      },
    ]).select().single()

    if (data) {
      setIsSessionActive(true)
      setWorkdayState('active')
      setSessionId(data.id)
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
      await supabase
        .from('work_logs')
        .update({ end_time: new Date() })
        .eq('id', id)

      setIsSessionActive(false)
      setWorkdayState('inactive')
      setTasks([])
      setSessionId(null)
    }
  }

  const extractTags = (text: string): string[] => {
    const matches = text.match(/#([A-Za-zĀ-ž0-9]+)/g)
    return matches ? [...new Set(matches.map(t => t.slice(1)))] : []
  }

  const extractAndSaveTags = async (title: string, notes: string): Promise<string[]> => {
    if (!user) return []
    const rawTags = [...extractTags(title), ...extractTags(notes)]
    const cleanTags = [...new Set(rawTags)].filter(t => t.trim() !== '')

    for (const tag of cleanTags) {
      const { data } = await supabase
        .from('tags')
        .select('usage_count')
        .eq('name', tag)
        .eq('user_id', user.id)
        .single()

      if (data) {
        await supabase
          .from('tags')
          .update({ usage_count: data.usage_count + 1 })
          .eq('name', tag)
          .eq('user_id', user.id)
      } else {
        await supabase
          .from('tags')
          .insert({ name: tag, usage_count: 1, user_id: user.id })
      }
    }

    await loadTags(user.id)
    return cleanTags
  }

  const addNewTask = (isCall = false) => {
    const newTask: Task = {
      id: crypto.randomUUID(),
      title: '',
      notes: '',
      tags: [],
      images: [],
      uploadedImageUrls: [],
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

  const insertTag = (taskId: string, tag: string) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task
        if (activeInput === 'title') {
          return { ...task, title: `${task.title} #${tag}` }
        } else if (activeInput === 'notes') {
          return { ...task, notes: `${task.notes} #${tag}` }
        }
        return task
      })
    )
  }

  const uploadImages = async (task: Task, taskLogId: number): Promise<string[]> => {
    if (!user) return []
    const urls: string[] = []

    for (const image of task.images) {
      const fileName = `${user.id}/${taskLogId}/${Date.now()}-${image.name}`
      const { error: uploadError } = await supabase.storage
        .from('task-images')
        .upload(fileName, image)

      if (!uploadError) {
        const publicUrl = supabase.storage
          .from('task-images')
          .getPublicUrl(fileName).data.publicUrl

        urls.push(publicUrl)

        await supabase.from('task_images').insert({
          user_id: user.id,
          task_log_id: taskLogId,
          url: publicUrl,
        })
      }
    }

    return urls
  }

  const saveTaskToDB = async (task: Task, tags: string[]) => {
    if (!user || !sessionId) return

    const { data } = await supabase.from('task_logs').insert([
      {
        session_id: sessionId,
        title: task.title,
        note: task.notes,
        start_time: task.startTime,
        end_time: new Date(),
        user_id: user.id,
      },
    ]).select().single()

    if (data) {
      const uploadedUrls = await uploadImages(task, data.id)
      updateTask(task.id, { uploadedImageUrls: uploadedUrls })
    }
  }

  // TURPINĀJUMS SEKOS 2. daļā...


  const renderTask = (task: Task) => {
    const isSaving = savingTasks[task.id] === true

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
            onFocus={() => setActiveInput('title')}
            readOnly={readonly}
          />
          {!readonly && (
            <button
              disabled={isSaving}
              onClick={async () => {
                const titleFilled = task.title.trim().length > 0
                const notesFilled = task.notes.trim().length > 0

                if (!titleFilled && !notesFilled) {
                  const shouldDelete = window.confirm('Uzdevums netiks saglabāts.\n\nVai dzēst šo uzdevumu?')
                  if (shouldDelete) {
                    setTasks((prev) => prev.filter((t) => t.id !== task.id))
                  }
                  return
                }

                if (!titleFilled || !notesFilled) {
                  alert('Lūdzu aizpildi gan uzdevuma nosaukumu, gan piezīmes!')
                  return
                }

                setSavingTasks((prev) => ({ ...prev, [task.id]: true }))
                updateTask(task.id, {
                  status: 'finished',
                  endTime: new Date(),
                })

                const tags = await extractAndSaveTags(task.title, task.notes)
                await saveTaskToDB(task, tags)
                setSavingTasks((prev) => ({ ...prev, [task.id]: false }))
              }}
              className={`px-4 py-2 rounded text-white ${isSaving ? 'bg-gray-500' : 'bg-red-600 hover:bg-red-700'}`}
            >
              {isSaving ? 'Saglabājas...' : 'Pabeigt'}
            </button>
          )}
        </div>

        <div className="flex gap-4">
          <textarea
            placeholder="Piezīmes"
            className="w-1/2 border p-2 rounded h-28 resize-none"
            value={task.notes}
            onFocus={() => setActiveInput('notes')}
            onChange={(e) => !readonly && updateTask(task.id, { notes: e.target.value })}
            readOnly={readonly}
          />
          <div className="w-1/2 border p-2 rounded min-h-[7rem] bg-black text-white">
            {!readonly && tagLibrary.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tagLibrary.map((tag, idx) => (
                  <button
                    key={idx}
                    onClick={() => insertTag(task.id, tag)}
                    className="bg-cyan-700 text-white text-sm px-2 py-1 rounded hover:bg-cyan-500"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
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
                    const newFiles = Array.from(e.target.files)
                    const total = task.images.length + task.uploadedImageUrls.length
                    const available = 5 - total
                    if (available <= 0) {
                      alert('Maksimālais attēlu skaits ir 5!')
                      return
                    }
                    const allowedFiles = newFiles.slice(0, available)
                    if (allowedFiles.length < newFiles.length) {
                      alert(`Var pievienot tikai vēl ${available} attēlu(s)!`)
                    }
                    updateTask(task.id, {
                      images: [...task.images, ...allowedFiles],
                    })
                  }
                }}
              />
              Pievienot attēlus
            </label>
          )}
          <div className="flex gap-2 flex-wrap">
            {task.uploadedImageUrls.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt="Attēls"
                className="w-16 h-16 object-cover rounded cursor-pointer"
                onClick={() => window.open(url, '_blank')}
              />
            ))}
            {!readonly && task.images.map((file, idx) => (
              <div key={`new-${idx}`} className="relative w-16 h-16">
                <img
                  src={URL.createObjectURL(file)}
                  alt="Jauns attēls"
                  className="w-16 h-16 object-cover rounded"
                />
                <button
                  className="absolute top-0 right-0 bg-black bg-opacity-70 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center"
                  onClick={() => {
                    const updated = [...task.images]
                    updated.splice(idx, 1)
                    updateTask(task.id, { images: updated })
                  }}
                  title="Dzēst attēlu"
                >
                  ×
                </button>
              </div>
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
          <div className="flex gap-2 flex-wrap">
            {task.uploadedImageUrls.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt="Attēls"
                className="w-16 h-16 object-cover rounded cursor-pointer"
                onClick={() => window.open(url, '_blank')}
              />
            ))}
          </div>
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
      {/* Header */}
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

      {/* Workday Controls */}
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

      {/* Regular Tasks */}
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

      {/* Call Tasks */}
      {callTasks.length > 0 && (
        <div className="border-t pt-4 space-y-6">
          {callTasks.map((task) => (
            <div key={task.id}>{renderTask(task)}</div>
          ))}
        </div>
      )}

      {/* Add Call Task */}
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
