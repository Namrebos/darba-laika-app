'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import TaskCard from '../components/TaskCard'

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

export default function WorkdayPage() {
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

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(task => task.id !== id))
  }

  if (loading) return <div className="text-center p-10">Notiek ielāde...</div>

  const finishedTasks = tasks.filter((t) => t.status === 'finished' && !t.isCall)
  const callTasks = tasks.filter((t) => t.isCall)

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
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
            <TaskCard
              key={task.id}
              task={task}
              user={user}
              sessionId={sessionId}
              updateTask={updateTask}
              deleteTask={deleteTask}
              tagLibrary={tagLibrary}
              setSavingTasks={setSavingTasks}
              savingTasks={savingTasks}
              activeInput={activeInput}
              setActiveInput={setActiveInput}
              loadTags={loadTags}
              extractAndSaveTags={extractAndSaveTags}
              saveTaskToDB={saveTaskToDB}
            />
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
            <TaskCard
              key={task.id}
              task={task}
              user={user}
              sessionId={sessionId}
              updateTask={updateTask}
              deleteTask={deleteTask}
              tagLibrary={tagLibrary}
              setSavingTasks={setSavingTasks}
              savingTasks={savingTasks}
              activeInput={activeInput}
              setActiveInput={setActiveInput}
              loadTags={loadTags}
              extractAndSaveTags={extractAndSaveTags}
              saveTaskToDB={saveTaskToDB}
            />
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
