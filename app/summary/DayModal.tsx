'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { format, parseISO } from 'date-fns'
import { calculateWorkHours, calculateCallHours } from './utils'

type DayModalProps = {
  date: string // 'yyyy-MM-dd'
  onClose: () => void
}

export default function DayModal({ date, onClose }: DayModalProps) {
  const [workLog, setWorkLog] = useState<any | null>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [hours, setHours] = useState<{ baseHours: number; overtimeHours: number; callHours: number }>({
    baseHours: 0,
    overtimeHours: 0,
    callHours: 0,
  })

  useEffect(() => {
    loadData()
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

    setTasks(taskLogs || [])

    const { baseHours, overtimeHours } = work
      ? calculateWorkHours(new Date(work.start_time), new Date(work.end_time))
      : { baseHours: 0, overtimeHours: 0 }

    const callTasks = taskLogs?.filter((t) => t.isCall) || []
    const callHours = calculateCallHours(callTasks)

    setHours({ baseHours, overtimeHours, callHours })
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background p-6 rounded-xl shadow-xl w-full max-w-md space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold">{format(parseISO(date), 'yyyy-MM-dd')}</h2>
          <button onClick={onClose} className="text-sm text-red-500 font-semibold">Aizvērt</button>
        </div>

        {loading ? (
          <div>Ielādē...</div>
        ) : (
          <div className="space-y-2">
            <div>
              <p><strong>Darba laiks:</strong> {workLog ? `${format(new Date(workLog.start_time), 'HH:mm')} – ${format(new Date(workLog.end_time), 'HH:mm')}` : 'Nav datu'}</p>
              <p><strong>Pamata:</strong> {hours.baseHours}h, <strong>Virsstundas:</strong> {hours.overtimeHours}h, <strong>Izsaukumi:</strong> {hours.callHours}h</p>
            </div>

            <div className="space-y-1">
              <p className="font-semibold">Uzdevumi:</p>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nav uzdevumu</p>
              ) : (
                tasks.map((task) => (
                  <div key={task.id} className="p-2 border rounded bg-muted text-sm">
                    <p><strong>{task.title || 'Bez nosaukuma'}</strong></p>
                    <p>{task.note}</p>
                    <p className="text-xs text-gray-500">
                      {format(new Date(task.start_time), 'HH:mm')} – {format(new Date(task.end_time), 'HH:mm')}
                      {task.isCall ? ' (izsaukums)' : ''}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
