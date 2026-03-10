'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import imageCompression from 'browser-image-compression'
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
  supabaseTaskId?: number
  isCall: boolean
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
  saveTaskToDB: (task: Task, tags: string[]) => Promise<void>
  extractTagsOnly: (title: string, notes: string) => string[]
  saveTagUsage: (userId: string, tags: string[]) => Promise<void>
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
  saveTaskToDB,
  extractTagsOnly,
  saveTagUsage
}: Props) {
  const isSaving = savingTasks[task.id] === true

  const [selectedImages, setSelectedImages] = useState<string[] | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [touchEndX, setTouchEndX] = useState<number | null>(null)
  const [localPreviewUrls, setLocalPreviewUrls] = useState<string[]>([])

  useEffect(() => {
    const urls = task.images.map((file) => URL.createObjectURL(file))
    setLocalPreviewUrls(urls)

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [task.images])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedImages) return

      if (e.key === 'Escape') {
        closeImageModal()
        return
      }

      if (e.key === 'ArrowRight' && selectedIndex < selectedImages.length - 1) {
        setSelectedIndex((prev) => prev + 1)
      }

      if (e.key === 'ArrowLeft' && selectedIndex > 0) {
        setSelectedIndex((prev) => prev - 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedImages, selectedIndex])

  // Tikai lokālā tagu sinhronizācija (DB insert/update notiek page.tsx)
  useEffect(() => {
    const syncTags = () => {
      const title = task.title.trim()
      const notes = task.notes.trim()
      if (!title || !notes) return
      const tags = extractTagsOnly(title, notes)
      updateTask(task.id, { tags })
    }
    const timeout = setTimeout(syncTags, 1200)
    return () => clearTimeout(timeout)
  }, [task.title, task.notes])

  // Attēlu augšupielāde tikai pēc supabaseTaskId
  useEffect(() => {
    const uploadImages = async () => {
      if (!user || !task.supabaseTaskId) return
      if (!task.isCall && !sessionId) return

      const newImages = task.images.filter(
        (file) => !task.uploadedImageUrls.some((url) => url.includes(file.name))
      )
      if (newImages.length === 0) return

      const uploadedUrls: string[] = [...task.uploadedImageUrls]

      for (const image of newImages) {
        const basePath = task.isCall
          ? `isCall/${task.supabaseTaskId}`
          : `${sessionId}/${task.supabaseTaskId}`

        const filePath = `${basePath}/${image.name}`

        let fileToUpload: File = image

        try {
          fileToUpload = await imageCompression(image, {
            maxSizeMB: 1.5,
            maxWidthOrHeight: 1600,
            initialQuality: 0.9,
            useWebWorker: true,
          })
        } catch (compressionError) {
          console.error('Kļūda kompresējot attēlu:', compressionError)
        }

        const { error: uploadError } = await supabase.storage
          .from('task-images')
          .upload(filePath, fileToUpload, {
            contentType: fileToUpload.type,
            upsert: false,
          })

        if (uploadError) {
          console.error('Kļūda augšupielādējot attēlu:', uploadError.message)
          continue
        }

        const { data: publicUrlData } = supabase.storage.from('task-images').getPublicUrl(filePath)
        const publicUrl = publicUrlData?.publicUrl

        if (publicUrl) {
          uploadedUrls.push(publicUrl)

          await supabase.from('task_images').insert({
            task_log_id: task.supabaseTaskId,
            user_id: user.id,
            url: publicUrl,
          })
        }
      }

      updateTask(task.id, { uploadedImageUrls: uploadedUrls, images: [] })
    }

    uploadImages()
  }, [task.images, task.supabaseTaskId, user, sessionId, task.isCall])

  const closeImageModal = () => {
    setSelectedImages(null)
    setSelectedIndex(0)
    setTouchStartX(null)
    setTouchEndX(null)
  }

  const goPrev = () => {
    if (!selectedImages) return
    if (selectedIndex === 0) return
    setSelectedIndex((prev) => prev - 1)
  }

  const goNext = () => {
    if (!selectedImages) return
    if (selectedIndex >= selectedImages.length - 1) return
    setSelectedIndex((prev) => prev + 1)
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setTouchEndX(null)
    setTouchStartX(e.targetTouches[0].clientX)
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    setTouchEndX(e.targetTouches[0].clientX)
  }

  const handleTouchEnd = () => {
    if (touchStartX === null || touchEndX === null) return

    const distance = touchStartX - touchEndX
    const minSwipeDistance = 50

    if (distance > minSwipeDistance) {
      goNext()
    } else if (distance < -minSwipeDistance) {
      goPrev()
    }

    setTouchStartX(null)
    setTouchEndX(null)
  }

  const openLocalGallery = (index: number) => {
    if (localPreviewUrls.length === 0) return
    setSelectedImages(localPreviewUrls)
    setSelectedIndex(index)
  }

  const openUploadedGallery = (index: number) => {
    if (task.uploadedImageUrls.length === 0) return
    setSelectedImages(task.uploadedImageUrls)
    setSelectedIndex(index)
  }

  const handleRemoveUploadedImage = async (urlToDelete: string) => {
    if (!user || !task.supabaseTaskId) return
    if (!task.isCall && !sessionId) return

    const fileName = urlToDelete.split('/').pop()?.split('?')[0]

    if (fileName) {
      const basePath = task.isCall
        ? `isCall/${task.supabaseTaskId}`
        : `${sessionId}/${task.supabaseTaskId}`

      const storagePath = `${basePath}/${fileName}`

      const { error: storageError } = await supabase.storage.from('task-images').remove([storagePath])
      if (storageError) {
        console.error('Kļūda dzēšot attēlu no storage:', storageError.message)
      }
    }

    const { error: dbError } = await supabase
      .from('task_images')
      .delete()
      .eq('task_log_id', task.supabaseTaskId)
      .eq('url', urlToDelete)

    if (dbError) {
      console.error('Kļūda dzēšot attēlu no DB:', dbError.message)
    }

    const updated = task.uploadedImageUrls.filter((url) => url !== urlToDelete)
    updateTask(task.id, { uploadedImageUrls: updated })
  }

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

    const tags = extractTagsOnly(task.title, task.notes)
    if (user) await saveTagUsage(user.id, tags)
    updateTask(task.id, { tags })

    if (user && task.isCall) {
      await saveTaskToDB({ ...task, endTime, status: 'finished' }, tags)
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
    <>
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
            <>
              <button
                disabled={isSaving}
                onClick={handleFinish}
                className={`px-4 py-2 rounded text-white ${isSaving ? 'bg-gray-500' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {isSaving ? 'Saglabājas...' : 'Pabeigt'}
              </button>
              <button
                className="px-4 py-2 rounded bg-gray-200 text-black hover:bg-gray-300"
                onClick={() => deleteTask(task.id)}
              >
                Dzēst
              </button>
            </>
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
              localPreviewUrls.map((previewUrl, idx) => (
                <div key={idx} className="relative w-16 h-16">
                  <img
                    src={previewUrl}
                    alt="Jauns attēls"
                    className="w-16 h-16 object-cover rounded cursor-pointer"
                    onClick={() => openLocalGallery(idx)}
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

            {task.uploadedImageUrls.map((url, idx) => (
              <div key={idx} className="relative w-16 h-16">
                <img
                  src={url}
                  alt="Attēls"
                  className="w-16 h-16 object-cover rounded cursor-pointer"
                  onClick={() => openUploadedGallery(idx)}
                />
                {!readonly && (
                  <button
                    className="absolute top-0 right-0 bg-black bg-opacity-70 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center"
                    onClick={() => handleRemoveUploadedImage(url)}
                    title="Dzēst augšupielādēto attēlu"
                  >
                    ×
                  </button>
                )}
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

      {selectedImages && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={closeImageModal}
        >
          <div
            className="relative flex max-h-[90vh] max-w-[95vw] items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <button
              type="button"
              onClick={closeImageModal}
              className="absolute right-2 top-2 z-20 rounded-full bg-black/70 px-3 py-1 text-sm text-white hover:bg-black"
            >
              Aizvērt
            </button>

            <div className="absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-sm text-white">
              {selectedIndex + 1} / {selectedImages.length}
            </div>

            <button
              type="button"
              onClick={goPrev}
              disabled={selectedIndex === 0}
              className="absolute left-2 z-20 rounded-full bg-black/70 px-3 py-2 text-2xl text-white disabled:opacity-25"
            >
              ←
            </button>

            <img
              src={selectedImages[selectedIndex]}
              alt="Pilns attēls"
              loading="eager"
              decoding="async"
              className="max-h-[90vh] max-w-[95vw] rounded-xl object-contain shadow-2xl"
            />

            <button
              type="button"
              onClick={goNext}
              disabled={selectedIndex === selectedImages.length - 1}
              className="absolute right-2 z-20 rounded-full bg-black/70 px-3 py-2 text-2xl text-white disabled:opacity-25"
            >
              →
            </button>
          </div>
        </div>
      )}
    </>
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
      <>
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
                onClick={() => openUploadedGallery(idx)}
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

        {selectedImages && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
            onClick={closeImageModal}
          >
            <div
              className="relative flex max-h-[90vh] max-w-[95vw] items-center justify-center"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <button
                type="button"
                onClick={closeImageModal}
                className="absolute right-2 top-2 z-20 rounded-full bg-black/70 px-3 py-1 text-sm text-white hover:bg-black"
              >
                Aizvērt
              </button>

              <div className="absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-sm text-white">
                {selectedIndex + 1} / {selectedImages.length}
              </div>

              <button
                type="button"
                onClick={goPrev}
                disabled={selectedIndex === 0}
                className="absolute left-2 z-20 rounded-full bg-black/70 px-3 py-2 text-2xl text-white disabled:opacity-25"
              >
                ←
              </button>

              <img
                src={selectedImages[selectedIndex]}
                alt="Pilns attēls"
                loading="eager"
                decoding="async"
                className="max-h-[90vh] max-w-[95vw] rounded-xl object-contain shadow-2xl"
              />

              <button
                type="button"
                onClick={goNext}
                disabled={selectedIndex === selectedImages.length - 1}
                className="absolute right-2 z-20 rounded-full bg-black/70 px-3 py-2 text-2xl text-white disabled:opacity-25"
              >
                →
              </button>
            </div>
          </div>
        )}
      </>
    )
  }

  return null
}