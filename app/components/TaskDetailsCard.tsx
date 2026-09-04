'use client'

import { useEffect, useState } from 'react'
import { AlarmClockCheck, Circle, FileText, Pencil } from 'lucide-react'
import ImageThumbnailGrid from '@/app/components/ImageThumbnailGrid'

type TimerItem = {
  id: string
  label: string
  durationText: string
}

type TimelineItem = {
  id: string
  label: string
  timeText: string
  durationFromPrevious?: string
}

type Props = {
  title: string
  notes?: string | null
  timeRangeText: string
  timers: TimerItem[]
  timeline?: TimelineItem[]
  imageUrls: string[]
  onOpenImage: (index: number) => void
  onClose: () => void
  badgeText?: string
  onRepeatTrip?: () => void
  onOpenDeliveryNote?: () => void
  onSaveNotes?: (notes: string) => Promise<void>
}

export default function TaskDetailsCard({
  title,
  notes,
  timeRangeText,
  timers,
  timeline = [],
  imageUrls,
  onOpenImage,
  onClose,
  badgeText,
  onRepeatTrip,
  onOpenDeliveryNote,
  onSaveNotes,
}: Props) {
  const [editingNotes, setEditingNotes] = useState(false)
  const [draftNotes, setDraftNotes] = useState(notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesError, setNotesError] = useState('')

  useEffect(() => {
    if (!editingNotes) setDraftNotes(notes || '')
  }, [editingNotes, notes])

  async function saveNotes() {
    if (!onSaveNotes || savingNotes) return
    setSavingNotes(true)
    setNotesError('')
    try {
      await onSaveNotes(draftNotes)
      setEditingNotes(false)
    } catch (error) {
      setNotesError(error instanceof Error ? error.message : 'Piezīmes neizdevās saglabāt.')
    } finally {
      setSavingNotes(false)
    }
  }

  return (
    <div className="border p-4 rounded bg-gray-100 dark:bg-zinc-800 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold text-black dark:text-white">{title}</h3>

        {badgeText && (
          <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 dark:border-zinc-600 dark:text-zinc-200">
            {badgeText}
          </span>
        )}
      </div>

      {editingNotes ? (
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">
            Piezīmes
          </label>
          <textarea
            value={draftNotes}
            onChange={(event) => setDraftNotes(event.target.value)}
            maxLength={5000}
            rows={5}
            autoFocus
            className="w-full rounded-lg border border-zinc-300 bg-white p-3 text-sm text-black outline-none focus:border-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-white"
          />
          {notesError && <p className="text-sm text-red-600 dark:text-red-400">{notesError}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraftNotes(notes || '')
                setNotesError('')
                setEditingNotes(false)
              }}
              disabled={savingNotes}
              className="rounded-lg border border-zinc-400 px-3 py-2 text-sm font-semibold text-zinc-700 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200"
            >
              Atcelt
            </button>
            <button
              type="button"
              onClick={() => void saveNotes()}
              disabled={savingNotes}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {savingNotes ? 'Saglabā...' : 'Saglabāt'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {notes ? (
            <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{notes}</p>
          ) : onSaveNotes ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Nav piezīmju</p>
          ) : null}
          {onSaveNotes && (
            <button
              type="button"
              onClick={() => setEditingNotes(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-400 px-3 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
            >
              <Pencil size={15} />
              Labot piezīmes
            </button>
          )}
        </div>
      )}

      <p className="text-sm text-gray-600 dark:text-gray-300">{timeRangeText}</p>

      {timers.length > 0 && (
        <div className="space-y-2 text-sm text-gray-800 dark:text-gray-200">
          <div className="flex items-center gap-2 font-semibold">
            <AlarmClockCheck size={16} />
            Taimeri
          </div>

          <div className="space-y-1 pl-1">
            {timers.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2">
                <Circle size={10} />
                <span className="font-mono">{entry.durationText}</span>
                <span className="text-gray-500 dark:text-gray-400">
                  {entry.label.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {timeline.length > 0 && (
        <div className="space-y-2 text-sm text-gray-800 dark:text-gray-200">
          <div className="flex items-center gap-2 font-semibold">
            <AlarmClockCheck size={16} />
            Timeline
          </div>

          <div className="pl-1">
            {timeline.map((entry, index) => (
              <div key={entry.id}>
                {index > 0 && entry.durationFromPrevious && (
                  <div className="ml-[5px] border-l-2 border-zinc-300 py-1.5 pl-5 text-xs text-gray-500 dark:border-zinc-600 dark:text-gray-400">
                    {entry.durationFromPrevious}
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <Circle size={11} className="mt-1 shrink-0 text-cyan-600" />
                  <div className="min-w-0">
                    <div className="break-words">{entry.label}</div>
                    <div className="font-mono text-xs text-gray-500 dark:text-gray-400">{entry.timeText}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ImageThumbnailGrid
        images={imageUrls}
        onOpen={onOpenImage}
        size="small"
      />

      <div className="flex flex-wrap justify-between gap-2">
        <button className="text-sm text-gray-600 underline" onClick={onClose}>Aizvērt</button>
        <div className="flex flex-wrap gap-2">
          {onOpenDeliveryNote && <button type="button" onClick={onOpenDeliveryNote} className="inline-flex items-center gap-2 rounded-lg border border-blue-500 px-3 py-2 text-sm font-semibold text-blue-600 dark:text-blue-300"><FileText size={16} />Pavadzīme</button>}
          {onRepeatTrip && <button type="button" onClick={onRepeatTrip} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Atkārtot braucienu</button>}
        </div>
      </div>
    </div>
  )
}
