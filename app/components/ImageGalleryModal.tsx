'use client'

import { useEffect, useState } from 'react'

type Props = {
  images: string[] | null
  selectedIndex: number
  setSelectedIndex: (value: number | ((prev: number) => number)) => void
  onClose: () => void
}

export default function ImageGalleryModal({
  images,
  selectedIndex,
  setSelectedIndex,
  onClose,
}: Props) {
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [touchEndX, setTouchEndX] = useState<number | null>(null)

  useEffect(() => {
    if (!images) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      if (e.key === 'ArrowRight' && selectedIndex < images.length - 1) {
        setSelectedIndex((prev) => prev + 1)
      }

      if (e.key === 'ArrowLeft' && selectedIndex > 0) {
        setSelectedIndex((prev) => prev - 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [images, selectedIndex, setSelectedIndex, onClose])

  useEffect(() => {
    if (!images || images.length === 0) return

    const preloadIndexes = [selectedIndex - 1, selectedIndex + 1].filter(
      (i) => i >= 0 && i < images.length
    )

    preloadIndexes.forEach((i) => {
      const img = new window.Image()
      img.src = images[i]
    })
  }, [images, selectedIndex])

  if (!images || images.length === 0) return null

  const goPrev = () => {
    if (selectedIndex === 0) return
    setSelectedIndex((prev) => prev - 1)
  }

  const goNext = () => {
    if (selectedIndex >= images.length - 1) return
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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] max-w-[95vw] items-center justify-center touch-pan-y"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 z-20 rounded-full bg-black/70 px-3 py-1 text-sm text-white hover:bg-black"
        >
          Aizvērt
        </button>

        <div className="absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-sm text-white">
          {selectedIndex + 1} / {images.length}
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
          src={images[selectedIndex]}
          alt="Pilns attēls"
          loading="eager"
          decoding="async"
          draggable={false}
          className="max-h-[90vh] max-w-[95vw] rounded-xl object-contain shadow-2xl select-none"
        />

        <button
          type="button"
          onClick={goNext}
          disabled={selectedIndex === images.length - 1}
          className="absolute right-2 z-20 rounded-full bg-black/70 px-3 py-2 text-2xl text-white disabled:opacity-25"
        >
          →
        </button>
      </div>
    </div>
  )
}