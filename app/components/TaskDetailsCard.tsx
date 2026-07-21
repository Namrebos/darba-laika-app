'use client'

import { AlarmClockCheck, Circle } from 'lucide-react'
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
}: Props) {
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

      {notes && (
        <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
          {notes}
        </p>
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

      <button
        className="text-sm text-gray-600 underline"
        onClick={onClose}
      >
        Aizvērt
      </button>
    </div>
  )
}
