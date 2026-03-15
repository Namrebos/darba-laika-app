'use client'

import ImageThumbnailGrid from '@/app/components/ImageThumbnailGrid'

type Props = {
  title: string
  timeRangeText: string
  imageUrls: string[]
  onOpenImage: (index: number) => void
  onOpenDetails: () => void
  badgeText?: string
}

export default function TaskPreviewCard({
  title,
  timeRangeText,
  imageUrls,
  onOpenImage,
  onOpenDetails,
  badgeText,
}: Props) {
  return (
    <div className="border p-4 rounded bg-gray-100 dark:bg-zinc-800 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold text-black dark:text-white">{title}</h3>

        {badgeText && (
          <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 dark:border-zinc-600 dark:text-zinc-200">
            {badgeText}
          </span>
        )}
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-300">{timeRangeText}</p>

      <ImageThumbnailGrid
        images={imageUrls}
        onOpen={onOpenImage}
        size="small"
      />

      <button
        className="text-blue-600 underline text-sm"
        onClick={onOpenDetails}
      >
        Apskats
      </button>
    </div>
  )
}