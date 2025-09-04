'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { format, parseISO } from 'date-fns'
import { calculateWorkHours, calculateCallHours } from './utils'

type DayModalProps = {
  date: string // 'yyyy-MM-dd'
  onClose: () => void
}

type Task = {
  id: string
  title: string
  note: string
  start_time: string
  end_time: string
  isCall: boolean
  images?: string[]
}

export default function DayModal({ date, onClose }: DayModalProps) {
  const [workLog, setWorkLog] = useState<any | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [imagesByTask, setImagesByTask] = useState<Record<string, string[]>>({})
  const [hours, setHours] = useState<{ baseHours: number; overtimeHours: number; callHours: number }>({
    baseHours: 0,
    overtimeHours: 0,
    callHours: 0,
  })

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  async function loadData() {
    setLoading(true)

    const from = date + 'T00:00:00'
    const to = date + 'T23:59:59'

    const { data: workLogs } = await supabase
      .from('work_logs')
      .select('*')
      .gte('start_time', from)
      .lte('end_time', to)

    const work = workLogs?.[0] || null
    setWorkLog(work)

    const { data: taskLogs } = await supabase
      .from('task_logs')
      .select('*')
      .gte('start_time', from)
      .lte('end_time', to)

    const tasksWithImages = taskLogs || []
    setTasks(tasksWithImages)

    const { data: imageData } = await supabase
      .from('task_images')
      .select('url, task_log_id')
      .in('task_log_id', tasksWithImages.map((t) => t.id))

    const groupedImages: Record<string, string[]> = {}
    imageData?.forEach((img) => {
      if (!groupedImages[img.task_log_id]) groupedImages[img.task_log_id] = []
      groupedImages[img.task_log_id].push(img.url)
    })
    setImagesByTask(groupedImages)

    const { baseHours, overtimeHours } = work
      ? calculateWorkHours(new Date(work.start_time), new Date(work.end_time))
      : { baseHours: 0, overtimeHours: 0 }

    const callTasks = taskLogs?.filter((t) => t.isCall) || []
    const callHours = calculateCallHours(callTasks)

    setHours({ baseHours, overtimeHours, callHours })
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      {/* Panelis ar max augstumu un kolonnas izkārtojumu */}
      <div className="bg-white dark:bg-neutral-900 text-foreground rounded-xl shadow-2xl w-[92vw] max-w-lg max-h-[90vh] border border-border p-0 flex flex-col">
        {/* Header (nescrollējas) */}
        <div className="p-4 border-b border-border flex justify-between items-center shrink-0">
          <h2 className="text-lg font-bold">{format(parseISO(date), 'yyyy-MM-dd')}</h2>
          <button
            onClick={onClose}
            className="text-sm font-semibold text-red-600 hover:underline"
          >
            Aizvērt
          </button>
        </div>

        {/* Saturs ar vertikālo scroll */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {loading ? (
            <div>Ielādē...</div>
          ) : (
            <>
              <div className="text-sm space-y-1">
                <p>
                  <span className="font-semibold">Darba laiks:</span>{' '}
                  {workLog
                    ? `${format(new Date(workLog.start_time), 'HH:mm')} – ${format(
                        new Date(workLog.end_time),
                        'HH:mm'
                      )}`
                    : 'Nav datu'}
                </p>
                <p>
                  <span className="font-semibold">Pamata:</span> {hours.baseHours}h,{' '}
                  <span className="font-semibold">Virsstundas:</span> {hours.overtimeHours}h,{' '}
                  <span className="font-semibold">Izsaukumi:</span> {hours.callHours}h
                </p>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-sm">Uzdevumi:</p>
                {tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nav uzdevumu</p>
                ) : (
                  tasks.map((task) => (
                    <div key={task.id} className="p-3 bg-muted rounded border border-border text-sm space-y-2">
                      <p className="font-bold">{task.title || 'Bez nosaukuma'}</p>
                      <p className="whitespace-pre-line">{task.note}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(task.start_time), 'HH:mm')} – {format(new Date(task.end_time), 'HH:mm')}
                        {task.isCall ? ' (izsaukums)' : ''}
                      </p>

                      {imagesByTask[task.id]?.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {imagesByTask[task.id].map((url, idx) => (
                            <img
                              key={idx}
                              src={url}
                              alt="Uzdevuma attēls"
                              className="w-16 h-16 object-cover rounded cursor-pointer"
                              onClick={() => window.open(url, '_blank')}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
