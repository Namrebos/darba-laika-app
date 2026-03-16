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
  isCall: boolean
  supabaseTaskId?: number
}

type DictionaryWord = {
  name: string
  usageCount: number
}

function makeLocalId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function WorkdayPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [workdayState, setWorkdayState] = useState<'inactive' | 'active'>('inactive')
  const [tasks, setTasks] = useState<Task[]>([])
  const [dictionaryWords, setDictionaryWords] = useState<DictionaryWord[]>([])
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [savingTasks, setSavingTasks] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setUser(user)
      await checkSession(user)
      await loadDictionary(user.id)
      setLoading(false)
    }

    getUser()
  }, [router])

  useEffect(() => {
    if (user && sessionId) {
      loadSavedTasks(user.id, sessionId)
    }
  }, [user, sessionId])

  useEffect(() => {
    const autoSave = async () => {
      for (const task of tasks) {
        const title = task.title.trim()
        const notes = task.notes.trim()

        if (!title || !notes || task.supabaseTaskId) continue

        await saveTaskToDB(task)
      }
    }

    const timeout = setTimeout(autoSave, 1000)
    return () => clearTimeout(timeout)
  }, [tasks])

  const normalizeDictionaryWord = (value: string) => {
    return value.trim().replace(/^#+/, '')
  }

  const loadSavedTasks = async (userId: string, activeSessionId: number) => {
    const { data: logs } = await supabase
      .from('task_logs')
      .select('*')
      .eq('user_id', userId)
      .or(`session_id.eq.${activeSessionId},isCall.eq.true`)
      .order('start_time', { ascending: true })

    if (!logs) return

    const { data: images } = await supabase
      .from('task_images')
      .select('*')
      .eq('user_id', userId)

    const restoredTasks: Task[] = logs.map((log: any) => {
      const uploaded =
        images
          ?.filter((img: any) => img.task_log_id === log.id)
          .map((img: any) => img.url) || []

      const status: Task['status'] = log.end_time
        ? 'finished'
        : log.start_time
          ? 'active'
          : 'starting'

      return {
        id: makeLocalId(),
        title: log.title ?? '',
        notes: log.note ?? '',
        tags: [],
        images: [],
        uploadedImageUrls: uploaded,
        status,
        startTime: log.start_time ? new Date(log.start_time) : undefined,
        endTime: log.end_time ? new Date(log.end_time) : undefined,
        supabaseTaskId: log.id,
        isCall: !!log.isCall,
      }
    })

    setTasks(restoredTasks)
  }

  const checkSession = async (currentUser: User) => {
    const { data } = await supabase
      .from('work_logs')
      .select('*')
      .eq('user_id', currentUser.id)
      .is('end_time', null)
      .order('start_time', { ascending: false })
      .limit(1)

    if (data && data.length > 0) {
      setSessionId(data[0].id)
      setWorkdayState('active')
    }
  }

  const loadDictionary = async (userId: string) => {
    const { data } = await supabase
      .from('tags')
      .select('name, usage_count')
      .eq('user_id', userId)

    if (!data) {
      setDictionaryWords([])
      return
    }

    const mapped: DictionaryWord[] = data.map((row: any) => ({
      name: row.name,
      usageCount: row.usage_count ?? 0,
    }))

    setDictionaryWords(mapped)
  }

  const saveDictionaryWord = async (userId: string, rawWord: string) => {
    const cleanWord = normalizeDictionaryWord(rawWord)
    if (!cleanWord) return

    const { data: existingWords } = await supabase
      .from('tags')
      .select('id, name, usage_count')
      .eq('user_id', userId)

    const existing = existingWords?.find(
      (row: any) => String(row.name).toLowerCase() === cleanWord.toLowerCase()
    )

    if (existing) {
      await supabase
        .from('tags')
        .update({ usage_count: (existing.usage_count ?? 0) + 1 })
        .eq('id', existing.id)
    } else {
      await supabase.from('tags').insert({
        name: cleanWord,
        usage_count: 1,
        user_id: userId,
      })
    }

    await loadDictionary(userId)
  }

  const saveDictionaryWords = async (userId: string, rawWords: string[]) => {
    const uniqueWords = [...new Set(rawWords.map(normalizeDictionaryWord).filter(Boolean))]
    if (uniqueWords.length === 0) return

    const { data: existingWords } = await supabase
      .from('tags')
      .select('id, name, usage_count')
      .eq('user_id', userId)

    for (const cleanWord of uniqueWords) {
      const existing = existingWords?.find(
        (row: any) => String(row.name).toLowerCase() === cleanWord.toLowerCase()
      )

      if (existing) {
        await supabase
          .from('tags')
          .update({ usage_count: (existing.usage_count ?? 0) + 1 })
          .eq('id', existing.id)
      } else {
        await supabase.from('tags').insert({
          name: cleanWord,
          usage_count: 1,
          user_id: userId,
        })
      }
    }

    await loadDictionary(userId)
  }

  const deleteDictionaryWords = async (userId: string, wordsToDelete: string[]) => {
    if (wordsToDelete.length === 0) return

    await supabase
      .from('tags')
      .delete()
      .eq('user_id', userId)
      .in('name', wordsToDelete)

    await loadDictionary(userId)
  }

  const uploadImages = async (task: Task, taskLogId: number): Promise<string[]> => {
    if (!user) return []

    const urls: string[] = []

    for (const image of task.images) {
      const fileName = `${task.isCall ? `isCall/${taskLogId}` : `${user.id}/${taskLogId}`}/${Date.now()}-${image.name}`

      const { error: uploadError } = await supabase.storage
        .from('task-images')
        .upload(fileName, image)

      if (!uploadError) {
        const publicUrl = supabase.storage.from('task-images').getPublicUrl(fileName).data.publicUrl

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

  const saveTaskToDB = async (task: Task) => {
    if (!user) return
    if (!task.isCall && !sessionId) return

    const startISO = (task.startTime ? new Date(task.startTime) : new Date()).toISOString()
    const endISO =
      task.status === 'finished'
        ? (task.endTime ? new Date(task.endTime) : new Date()).toISOString()
        : null

    const { data, error } = await supabase
      .from('task_logs')
      .insert([
        {
          session_id: task.isCall ? null : sessionId,
          title: task.title,
          note: task.notes,
          start_time: startISO,
          end_time: endISO,
          user_id: user.id,
          isCall: task.isCall || false,
        },
      ])
      .select()
      .single()

    if (error) {
      console.error('Saglabāšanas kļūda:', error.message)
      return
    }

    if (data) {
      const uploadedUrls = await uploadImages(task, data.id)
      updateTask(task.id, {
        uploadedImageUrls: uploadedUrls,
        supabaseTaskId: data.id,
      })
    }
  }

  const startWorkday = async () => {
    if (!user) return

    const { data } = await supabase
      .from('work_logs')
      .insert([
        {
          user_id: user.id,
          project: 'Darba diena',
          start_time: new Date().toISOString(),
          description: '',
        },
      ])
      .select()
      .single()

    if (data) {
      setWorkdayState('active')
      setSessionId(data.id)
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
        .update({ end_time: new Date().toISOString() })
        .eq('id', id)

      setWorkdayState('inactive')
      setTasks([])
      setSessionId(null)
    }
  }

  const addNewTask = (isCall = false) => {
    const newTask: Task = {
      id: makeLocalId(),
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

  const updateTask = async (id: string, updated: Partial<Task>) => {
    const existing = tasks.find((task) => task.id === id)

    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, ...updated } : task))
    )

    if (!existing?.supabaseTaskId) return

    const updates: any = {}

    if (typeof updated.title === 'string') updates.title = updated.title.trim()
    if (typeof updated.notes === 'string') updates.note = updated.notes.trim()

    if (updated.status === 'finished' && updated.endTime) {
      updates.end_time = new Date(updated.endTime).toISOString()
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('task_logs').update(updates).eq('id', existing.supabaseTaskId)
    }
  }

  const deleteTask = async (id: string) => {
    const taskToDelete = tasks.find((task) => task.id === id)

    if (taskToDelete?.supabaseTaskId) {
      await supabase.from('task_logs').delete().eq('id', taskToDelete.supabaseTaskId)
      await supabase.from('task_images').delete().eq('task_log_id', taskToDelete.supabaseTaskId)
    }

    setTasks((prev) => prev.filter((task) => task.id !== id))
  }

  if (loading) {
    return <div className="p-10 text-center">Notiek ielāde...</div>
  }

  const callTasks = tasks.filter((task) => task.isCall)

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="space-y-4 rounded border p-4">
        <div className="flex justify-between">
          <button
            onClick={startWorkday}
            disabled={workdayState === 'active'}
            className={`rounded px-4 py-2 text-white ${workdayState === 'active' ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
          >
            Sākt darbadienu
          </button>

          <button
            onClick={endWorkday}
            disabled={workdayState === 'inactive'}
            className={`rounded px-4 py-2 text-white ${workdayState === 'inactive' ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700'}`}
          >
            Pabeigt darbadienu
          </button>
        </div>
      </div>

      {workdayState === 'active' && (
        <div className="space-y-6">
          {tasks
            .filter((task) => !task.isCall)
            .map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                user={user}
                sessionId={sessionId}
                updateTask={updateTask}
                deleteTask={deleteTask}
                dictionaryWords={dictionaryWords}
                onAddDictionaryWord={async (word) => {
                  if (!user) return
                  await saveDictionaryWord(user.id, word)
                }}
                onSaveDictionaryWords={async (words) => {
                  if (!user) return
                  await saveDictionaryWords(user.id, words)
                }}
                onDeleteDictionaryWords={async (words) => {
                  if (!user) return
                  await deleteDictionaryWords(user.id, words)
                }}
                setSavingTasks={setSavingTasks}
                savingTasks={savingTasks}
                saveTaskToDB={saveTaskToDB}
              />
            ))}

          {(() => {
            const nonCallTasks = tasks.filter((task) => !task.isCall)
            const last = nonCallTasks[nonCallTasks.length - 1]

            const canAdd =
              nonCallTasks.length === 0 ||
              (last &&
                (last.status === 'active' || last.status === 'finished') &&
                last.title.trim().length > 0 &&
                last.notes.trim().length > 0)

            return canAdd ? (
              <div>
                <button
                  onClick={() => addNewTask(false)}
                  className="rounded bg-green-600 px-4 py-2 text-white"
                >
                  Sākt uzdevumu
                </button>
              </div>
            ) : null
          })()}
        </div>
      )}

      {callTasks.length > 0 && (
        <div className="space-y-6 border-t pt-4">
          {callTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              user={user}
              sessionId={sessionId}
              updateTask={updateTask}
              deleteTask={deleteTask}
              dictionaryWords={dictionaryWords}
              onAddDictionaryWord={async (word) => {
                if (!user) return
                await saveDictionaryWord(user.id, word)
              }}
              onSaveDictionaryWords={async (words) => {
                if (!user) return
                await saveDictionaryWords(user.id, words)
              }}
              onDeleteDictionaryWords={async (words) => {
                if (!user) return
                await deleteDictionaryWords(user.id, words)
              }}
              setSavingTasks={setSavingTasks}
              savingTasks={savingTasks}
              saveTaskToDB={saveTaskToDB}
            />
          ))}
        </div>
      )}

      <div className="border-t pt-6">
        {(() => {
          const lastCall = callTasks[callTasks.length - 1]

          const canAddCall =
            callTasks.length === 0 ||
            (lastCall &&
              lastCall.status === 'finished' &&
              lastCall.title.trim().length > 0 &&
              lastCall.notes.trim().length > 0)

          return canAddCall ? (
            <button
              onClick={() => addNewTask(true)}
              className="rounded bg-red-400 px-6 py-2 font-semibold text-black"
            >
              Izsaukums
            </button>
          ) : null
        })()}
      </div>
    </div>
  )
}
