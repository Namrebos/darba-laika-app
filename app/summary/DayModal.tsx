'use client'

import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabaseClient'
import { calculateWorkHours, calculateCallHours } from './utils'
import ImageGalleryModal from '@/app/components/ImageGalleryModal'
import ImageThumbnailGrid from '@/app/components/ImageThumbnailGrid'

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
  const [hours, setHours] = useState({
    baseHours: 0,
    overtimeHours: 0,
    callHours: 0,
  })

  useEffect(() => {
    loadData()
  }, [date])

  async function loadData() {
    setLoading(true)

    const start = new Date(date)
    start.setHours(0, 0, 0, 0)

const end = new Date(date)
end.setHours(23, 59, 59, 999)

const from = start.toISOString()
const to = end.toISOString()

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

  const closeImageModal = () => {
    setSelectedImages(null)
    setSelectedIndex(0)
  }

  const openTaskGallery = (taskId: string, index: number) => {
    const taskImages = imagesByTask[taskId]
    if (!taskImages || taskImages.length === 0) return
    setSelectedImages(taskImages)
    setSelectedIndex(index)
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
                              <ImageThumbnailGrid
                                  images={imagesByTask[task.id]}
                                  onOpen={(index) => openTaskGallery(task.id, index)}
                                  size="medium"
                              />
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

      <ImageGalleryModal
        images={selectedImages}
        selectedIndex={selectedIndex}
        setSelectedIndex={setSelectedIndex}
        onClose={closeImageModal}
      />
    </>
  )
}