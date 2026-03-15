'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabaseClient'
import { calculateWorkHours, calculateCallHours } from './utils'
import ImageGalleryModal from '@/app/components/ImageGalleryModal'
import TaskPreviewCard from '@/app/components/TaskPreviewCard'
import TaskDetailsCard from '@/app/components/TaskDetailsCard'

type DayModalProps = {
  date: string
  onClose: () => void
}

type WorkLog = {
  start_time: string
  end_time: string
}

type Task = {
  id: number
  title: string | null
  note: string | null
  start_time: string
  end_time: string | null
  isCall?: boolean | null
  session_id?: string | null
}

type TaskImageRow = {
  url: string
  task_log_id: number
}

type TaskTimerRow = {
  id: string
  task_log_id: number
  label: string
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
}

type SelectedTask = {
  id: number
  title: string
  notes: string | null
  timeRangeText: string
  timers: { id: string; label: string; durationText: string }[]
  imageUrls: string[]
  badgeText?: string
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

function formatDurationFromSeconds(totalSeconds: number) {
  const totalMin = Math.floor(totalSeconds / 60)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return `${hh}h ${mm}m`
}

function buildTimeRangeText(start: string, end: string | null) {
  if (!end) return 'Nav pilna laika informācija'

  const startDate = new Date(start)
  const endDate = new Date(end)

  const diffMs = endDate.getTime() - startDate.getTime()
  const totalMin = Math.floor(diffMs / 60000)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  const durationText = `${hh}h ${mm}min`

  return `${format(startDate, 'HH:mm')}-${format(endDate, 'HH:mm')} (${durationText})`
}

export default function DayModal({ date, onClose }: DayModalProps) {
  const [workLog, setWorkLog] = useState<WorkLog | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [imagesByTask, setImagesByTask] = useState<Record<number, string[]>>({})
  const [timersByTask, setTimersByTask] = useState<Record<number, TaskTimerRow[]>>({})
  const [selectedImages, setSelectedImages] = useState<string[] | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedTask, setSelectedTask] = useState<SelectedTask | null>(null)
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
      setTimersByTask({})
      setHours({ baseHours: 0, overtimeHours: 0, callHours: 0 })
      setLoading(false)
      return
    }

    const work = ((workLogs || []) as WorkLog[])[0] || null
    const taskRows = (taskLogs || []) as Task[]

    setWorkLog(work)
    setTasks(taskRows)

    if (taskRows.length > 0) {
      const taskIds = taskRows.map((t) => t.id)

      const [{ data: imageData, error: imageError }, { data: timerData, error: timerError }] =
        await Promise.all([
          supabase.from('task_images').select('url, task_log_id').in('task_log_id', taskIds),
          supabase
            .from('task_timers')
            .select('id, task_log_id, label, started_at, ended_at, duration_seconds')
            .in('task_log_id', taskIds)
            .order('started_at', { ascending: true }),
        ])

      if (imageError) {
        console.error('Task images load error:', imageError)
        setImagesByTask({})
      } else {
        const groupedImages: Record<number, string[]> = {}

        ;((imageData || []) as TaskImageRow[]).forEach((img) => {
          if (!groupedImages[img.task_log_id]) groupedImages[img.task_log_id] = []
          groupedImages[img.task_log_id].push(img.url)
        })

        setImagesByTask(groupedImages)
      }

      if (timerError) {
        console.error('Task timers load error:', timerError)
        setTimersByTask({})
      } else {
        const groupedTimers: Record<number, TaskTimerRow[]> = {}

        ;((timerData || []) as TaskTimerRow[]).forEach((timer) => {
          if (!groupedTimers[timer.task_log_id]) groupedTimers[timer.task_log_id] = []
          groupedTimers[timer.task_log_id].push(timer)
        })

        setTimersByTask(groupedTimers)
      }
    } else {
      setImagesByTask({})
      setTimersByTask({})
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

  const openTaskGallery = (taskId: number, index: number) => {
    const taskImages = imagesByTask[taskId]
    if (!taskImages || taskImages.length === 0) return
    setSelectedImages(taskImages)
    setSelectedIndex(index)
  }

  const openTaskDetails = (task: Task) => {
    const timers = (timersByTask[task.id] || []).map((timer) => ({
      id: timer.id,
      label: timer.label,
      durationText:
        timer.duration_seconds !== null
          ? formatDurationFromSeconds(timer.duration_seconds)
          : 'Aktīvs taimeris',
    }))

    setSelectedTask({
      id: task.id,
      title: task.title || 'Bez nosaukuma',
      notes: task.note,
      timeRangeText: buildTimeRangeText(task.start_time, task.end_time),
      timers,
      imageUrls: imagesByTask[task.id] || [],
      badgeText: isCallTask(task) ? 'izsaukums' : undefined,
    })
  }

  const previewCards = useMemo(() => {
    return tasks.map((task) => ({
      id: task.id,
      title: task.title || 'Bez nosaukuma',
      timeRangeText: buildTimeRangeText(task.start_time, task.end_time),
      imageUrls: imagesByTask[task.id] || [],
      badgeText: isCallTask(task) ? 'izsaukums' : undefined,
      raw: task,
    }))
  }, [tasks, imagesByTask])

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-300 bg-white text-zinc-900 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950 dark:text-white">
          <div className="flex items-center justify-between border-b border-zinc-300 bg-white px-5 py-4 dark:border-zinc-700 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold">{format(parseISO(date), 'yyyy-MM-dd')}</h2>

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
                      <span className="font-medium">Virsstundas:</span> {formatHours(hours.overtimeHours)}
                      {' • '}
                      <span className="font-medium">Izsaukumi:</span> {formatHours(hours.callHours)}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-white dark:bg-zinc-950">
                  <h3 className="mb-3 text-base font-semibold">Uzdevumi</h3>

                  {previewCards.length === 0 ? (
                    <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      Nav uzdevumu
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {previewCards.map((task) => (
                        <TaskPreviewCard
                          key={task.id}
                          title={task.title}
                          timeRangeText={task.timeRangeText}
                          imageUrls={task.imageUrls}
                          onOpenImage={(index) => openTaskGallery(task.id, index)}
                          onOpenDetails={() => openTaskDetails(task.raw)}
                          badgeText={task.badgeText}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedTask && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl">
            <TaskDetailsCard
              title={selectedTask.title}
              notes={selectedTask.notes}
              timeRangeText={selectedTask.timeRangeText}
              timers={selectedTask.timers}
              imageUrls={selectedTask.imageUrls}
              onOpenImage={(index) => openTaskGallery(selectedTask.id, index)}
              onClose={() => setSelectedTask(null)}
              badgeText={selectedTask.badgeText}
            />
          </div>
        </div>
      )}

      <ImageGalleryModal
        images={selectedImages}
        selectedIndex={selectedIndex}
        setSelectedIndex={setSelectedIndex}
        onClose={closeImageModal}
      />
    </>
  )
}