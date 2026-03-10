'use client'

import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabaseClient'
import { calculateWorkHours, calculateCallHours } from './utils'

type DayModalProps = {
  date: string
  onClose: () => void
}

type WorkLog = {
  start_time: string
  end_time: string
}

type Task = {
  id: string
  title: string | null
  note: string | null
  start_time: string
  end_time: string | null
  isCall?: boolean | null
  session_id?: string | null
}

type TaskImageRow = {
  url: string
  task_log_id: string
}

function isCallTask(task: Task) {
  if (typeof task.isCall === 'boolean') return task.isCall
  return !task.session_id
}

function formatHours(hours: number) {
  const totalMin = Math.round((hours || 0) * 60)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return `${hh}h ${mm}m`
}

export default function DayModal({ date, onClose }: DayModalProps) {
  const [workLog, setWorkLog] = useState<WorkLog | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [imagesByTask, setImagesByTask] = useState<Record<string, string[]>>({})
  const [selectedImages, setSelectedImages] = useState<string[] | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [touchEndX, setTouchEndX] = useState<number | null>(null)

  const [hours, setHours] = useState({
    baseHours: 0,
    overtimeHours: 0,
    callHours: 0,
  })

  useEffect(() => {
    loadData()
  }, [date])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedImages) return

      if (e.key === 'Escape') {
        setSelectedImages(null)
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

  async function loadData() {
    setLoading(true)

    const from = `${date}T00:00:00`
    const to = `${date}T23:59:59`

    const { data: workLogs, error: workError } = await supabase
      .from('work_logs')
      .select('*')
      .gte('start_time', from)
      .lte('start_time', to)
      .order('start_time', { ascending: true })

    const { data: taskLogs, error: taskError } = await supabase
      .from('task_logs')
      .select('*')
      .gte('start_time', from)
      .lte('start_time', to)
      .order('start_time', { ascending: true })

    if (workError || taskError) {
      console.error('Day modal load error:', { workError, taskError })
      setWorkLog(null)
      setTasks([])
      setImagesByTask({})
      setHours({ baseHours: 0, overtimeHours: 0, callHours: 0 })
      setLoading(false)
      return
    }

    const work = ((workLogs || []) as WorkLog[])[0] || null
    const taskRows = (taskLogs || []) as Task[]

    setWorkLog(work)
    setTasks(taskRows)

    if (taskRows.length > 0) {
      const { data: imageData, error: imageError } = await supabase
        .from('task_images')
        .select('url, task_log_id')
        .in('task_log_id', taskRows.map((t) => t.id))

      if (imageError) {
        console.error('Task images load error:', imageError)
        setImagesByTask({})
      } else {
        const groupedImages: Record<string, string[]> = {}

        ;((imageData || []) as TaskImageRow[]).forEach((img) => {
          if (!groupedImages[img.task_log_id]) groupedImages[img.task_log_id] = []
          groupedImages[img.task_log_id].push(img.url)
        })

        setImagesByTask(groupedImages)
      }
    } else {
      setImagesByTask({})
    }

    const { baseHours, overtimeHours } = work
      ? calculateWorkHours(new Date(work.start_time), new Date(work.end_time))
      : { baseHours: 0, overtimeHours: 0 }

    const callTasks = taskRows
      .filter((t) => isCallTask(t) && t.end_time)
      .map((t) => ({
        start_time: t.start_time,
        end_time: t.end_time as string,
      }))

    const callHours = calculateCallHours(callTasks)

    setHours({ baseHours, overtimeHours, callHours })
    setLoading(false)
  }

  function closeImageModal() {
    setSelectedImages(null)
    setSelectedIndex(0)
    setTouchStartX(null)
    setTouchEndX(null)
  }

  function goPrev() {
    if (!selectedImages) return
    if (selectedIndex === 0) return
    setSelectedIndex((prev) => prev - 1)
  }

  function goNext() {
    if (!selectedImages) return
    if (selectedIndex >= selectedImages.length - 1) return
    setSelectedIndex((prev) => prev + 1)
  }

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    setTouchEndX(null)
    setTouchStartX(e.targetTouches[0].clientX)
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    setTouchEndX(e.targetTouches[0].clientX)
  }

  function handleTouchEnd() {
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

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-300 bg-white text-zinc-900 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950 dark:text-white">
          <div className="flex items-center justify-between border-b border-zinc-300 bg-white px-5 py-4 dark:border-zinc-700 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold">
              {format(parseISO(date), 'yyyy-MM-dd')}
            </h2>

            <button
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 hover:bg-zinc-100 dark:border-zinc-600 dark:text-white dark:hover:bg-zinc-800"
            >
              Aizvērt
            </button>
          </div>

          <div className="overflow-y-auto bg-white px-5 py-4 dark:bg-zinc-950">
            {loading ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Ielādē...</p>
            ) : (
              <div className="space-y-5">
                <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="font-medium">Darba laiks:</span>{' '}
                      {workLog
                        ? `${format(new Date(workLog.start_time), 'HH:mm')} – ${format(
                            new Date(workLog.end_time),
                            'HH:mm'
                          )}`
                        : 'Nav datu'}
                    </p>

                    <p>
                      <span className="font-medium">Pamata:</span> {formatHours(hours.baseHours)}
                      {' • '}
                      <span className="font-medium">Virsstundas:</span>{' '}
                      {formatHours(hours.overtimeHours)}
                      {' • '}
                      <span className="font-medium">Izsaukumi:</span> {formatHours(hours.callHours)}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-white dark:bg-zinc-950">
                  <h3 className="mb-3 text-base font-semibold">Uzdevumi</h3>

                  {tasks.length === 0 ? (
                    <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      Nav uzdevumu
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {tasks.map((task) => (
                        <div
                          key={task.id}
                          className="rounded-xl border border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-base font-semibold">
                                {task.title || 'Bez nosaukuma'}
                              </h4>

                              {isCallTask(task) && (
                                <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 dark:border-zinc-600 dark:text-zinc-200">
                                  izsaukums
                                </span>
                              )}
                            </div>

                            {task.note && (
                              <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                                {task.note}
                              </p>
                            )}

                            <p className="text-sm text-zinc-700 dark:text-zinc-200">
                              {format(new Date(task.start_time), 'HH:mm')}
                              {' – '}
                              {task.end_time
                                ? format(new Date(task.end_time), 'HH:mm')
                                : '---'}
                            </p>

                            {imagesByTask[task.id]?.length > 0 && (
                              <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3">
                                {imagesByTask[task.id].map((url, idx) => (
                                  <button
                                    key={`${task.id}-${idx}`}
                                    type="button"
                                    onClick={() => {
                                      setSelectedImages(imagesByTask[task.id])
                                      setSelectedIndex(idx)
                                    }}
                                    className="group overflow-hidden rounded-lg border border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
                                  >
                                    <img
                                      src={url}
                                      alt={`task-${task.id}-${idx}`}
                                      loading="lazy"
                                      decoding="async"
                                      width={320}
                                      height={220}
                                      className="h-28 w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                                    />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
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