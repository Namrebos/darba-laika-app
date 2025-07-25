'use client'

import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

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
}

type Props = {
  task: Task
  user: User | null
  sessionId: number | null
  updateTask: (id: string, updated: Partial<Task>) => void
  deleteTask: (id: string) => void
  tagLibrary: string[]
  setSavingTasks: (s: (prev: Record<string, boolean>) => Record<string, boolean>) => void
  savingTasks: Record<string, boolean>
  activeInput: 'title' | 'notes' | null
  setActiveInput: (input: 'title' | 'notes' | null) => void
  loadTags: (userId: string) => Promise<void>
  extractAndSaveTags: (title: string, notes: string) => Promise<string[]>
  saveTaskToDB: (task: Task, tags: string[]) => Promise<void>
}

export default function TaskCard({
  task,
  user,
  sessionId,
  updateTask,
  deleteTask,
  tagLibrary,
  setSavingTasks,
  savingTasks,
  activeInput,
  setActiveInput,
  loadTags,
  extractAndSaveTags,
  saveTaskToDB,
}: Props) {
  const isSaving = savingTasks[task.id] === true

  const handleFinish = async () => {
    const titleFilled = task.title.trim().length > 0
    const notesFilled = task.notes.trim().length > 0

    if (!titleFilled && !notesFilled) {
      const shouldDelete = window.confirm('Uzdevums netiks saglabāts.\n\nVai dzēst šo uzdevumu?')
      if (shouldDelete) deleteTask(task.id)
      return
    }

    if (!titleFilled || !notesFilled) {
      alert('Lūdzu aizpildi gan uzdevuma nosaukumu, gan piezīmes!')
      return
    }

    setSavingTasks((prev) => ({ ...prev, [task.id]: true }))
    const endTime = new Date()
    updateTask(task.id, { status: 'finished', endTime })

    const tags = await extractAndSaveTags(task.title, task.notes)

    const { data: insertedTask, error: insertError } = await supabase
      .from('task_logs')
      .insert({
        title: task.title,
        note: task.notes,
        user_id: user?.id,
        session_id: sessionId,
        start_time: task.startTime?.toISOString(),
        end_time: endTime.toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Kļūda saglabājot uzdevumu:', insertError.message)
      setSavingTasks((prev) => ({ ...prev, [task.id]: false }))
      return
    }

    const taskLogId = insertedTask.id
    const uploadedUrls: string[] = []

    for (const image of task.images) {
      const filePath = `${user?.id}/${Date.now()}_${image.name}`

      const { error: uploadError } = await supabase.storage
        .from('task-images')
        .upload(filePath, image)

      if (uploadError) {
        console.error('Kļūda augšupielādējot attēlu:', uploadError.message)
        continue
      }

      const { data: publicUrlData } = supabase.storage
        .from('task-images')
        .getPublicUrl(filePath)

      const publicUrl = publicUrlData?.publicUrl

      if (publicUrl) {
        uploadedUrls.push(publicUrl)
        await supabase.from('task_images').insert({
          task_log_id: taskLogId,
          user_id: user?.id,
          url: publicUrl,
        })
      }
    }

    if (uploadedUrls.length > 0) {
      updateTask(task.id, { uploadedImageUrls: uploadedUrls })
    }

    setSavingTasks((prev) => ({ ...prev, [task.id]: false }))
  }

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
          className="flex-1 border p-2 rounded bg-white dark:bg-zinc-800 text-black dark:text-white"
          value={task.title}
          onChange={(e) => !readonly && updateTask(task.id, { title: e.target.value })}
          onFocus={() => setActiveInput('title')}
          readOnly={readonly}
        />
        {!readonly && (
          <button
            disabled={isSaving}
            onClick={handleFinish}
            className={`px-4 py-2 rounded text-white ${isSaving ? 'bg-gray-500' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {isSaving ? 'Saglabājas...' : 'Pabeigt'}
          </button>
        )}
      </div>

      <div className="flex gap-4">
        <textarea
          placeholder="Piezīmes"
          className="w-1/2 border p-2 rounded h-28 resize-none bg-white dark:bg-zinc-800 text-black dark:text-white"
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
                  onClick={() => {
                    if (activeInput === 'title') {
                      updateTask(task.id, { title: task.title + ' #' + tag })
                    } else if (activeInput === 'notes') {
                      updateTask(task.id, { notes: task.notes + ' #' + tag })
                    }
                  }}
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
                  const allowed = newFiles.slice(0, available)
                  if (allowed.length < newFiles.length) {
                    alert(`Var pievienot tikai vēl ${available} attēlu(s)!`)
                  }
                  updateTask(task.id, { images: [...task.images, ...allowed] })
                }
              }}
            />
            Pievienot attēlus
          </label>
        )}
        <div className="flex gap-2 flex-wrap">
          {!readonly &&
            task.images.map((file, idx) => (
              <div key={idx} className="relative w-16 h-16">
                <img src={URL.createObjectURL(file)} alt="Jauns attēls" className="w-16 h-16 object-cover rounded" />
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
      <div className="border p-4 rounded bg-gray-100 dark:bg-zinc-800 space-y-2">
        <h3 className="font-bold text-black dark:text-white">{task.title}</h3>
        {start && end && (
          <p className="text-sm text-gray-600 dark:text-gray-300">
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
