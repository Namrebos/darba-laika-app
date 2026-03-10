'use client'

type Props = {
  images: string[]
  onOpen: (index: number) => void
  size?: 'small' | 'medium'
}

export default function ImageThumbnailGrid({
  images,
  onOpen,
  size = 'small'
}: Props) {

  if (!images || images.length === 0) return null

  const imageClass =
    size === 'medium'
      ? 'h-28 w-full object-cover'
      : 'w-16 h-16 object-cover'

  const wrapperClass =
    size === 'medium'
      ? 'grid grid-cols-2 gap-3 sm:grid-cols-3'
      : 'flex gap-2 flex-wrap'

  return (
    <div className={wrapperClass}>
      {images.map((url, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => onOpen(idx)}
          className="overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700"
        >
          <img
            src={`${url}?width=320&quality=70`}
            alt={`image-${idx}`}
            loading="lazy"
            decoding="async"
            className={imageClass}
          />
        </button>
      ))}
    </div>
  )
}