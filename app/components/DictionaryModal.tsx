'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, SquarePlus, Trash2, X } from 'lucide-react'

type DictionaryWord = {
  name: string
  usageCount: number
}

type Props = {
  open: boolean
  onClose: () => void
  words: DictionaryWord[]
  onAddWord: (word: string) => Promise<void>
  onDeleteWords: (words: string[]) => Promise<void>
}

export default function DictionaryModal({
  open,
  onClose,
  words,
  onAddWord,
  onDeleteWords,
}: Props) {
  const [search, setSearch] = useState('')
  const [newWord, setNewWord] = useState('')
  const [selectedWords, setSelectedWords] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (!open) {
      setSearch('')
      setNewWord('')
      setSelectedWords([])
    }
  }, [open])

  const filteredWords = useMemo(() => {
    const q = search.trim().toLowerCase()

    return [...words]
      .sort((a, b) => a.name.localeCompare(b.name, 'lv', { sensitivity: 'base' }))
      .filter((word) => {
        if (!q) return true
        return word.name.toLowerCase().includes(q)
      })
  }, [words, search])

  const allVisibleSelected =
    filteredWords.length > 0 &&
    filteredWords.every((word) => selectedWords.includes(word.name))

  const toggleWord = (word: string) => {
    setSelectedWords((prev) =>
      prev.includes(word)
        ? prev.filter((item) => item !== word)
        : [...prev, word]
    )
  }

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedWords((prev) =>
        prev.filter((item) => !filteredWords.some((word) => word.name === item))
      )
      return
    }

    setSelectedWords((prev) => {
      const next = new Set(prev)
      filteredWords.forEach((word) => next.add(word.name))
      return Array.from(next)
    })
  }

  const normalizeWord = (value: string) => {
    return value.trim().replace(/^#+/, '')
  }

  const handleAdd = async () => {
    const clean = normalizeWord(newWord)

    if (!clean) return

    const alreadyExists = words.some(
      (word) => word.name.toLowerCase() === clean.toLowerCase()
    )

    if (alreadyExists) {
      alert('Šāds vārds vārdnīcā jau eksistē.')
      return
    }

    try {
      setIsSaving(true)
      await onAddWord(clean)
      setNewWord('')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedWords.length === 0) return

    const confirmed = window.confirm(
      `Vai tiešām dzēst atlasītos vārdus? (${selectedWords.length})`
    )

    if (!confirmed) return

    try {
      setIsDeleting(true)
      await onDeleteWords(selectedWords)
      setSelectedWords([])
    } finally {
      setIsDeleting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-4 shadow-xl dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-black dark:text-white">Vārdnīca</h2>

          <button
            onClick={onClose}
            className="rounded p-2 text-black hover:bg-gray-100 dark:text-white dark:hover:bg-zinc-800"
            title="Aizvērt"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Meklēt vārdnīcā"
              className="w-full rounded border py-2 pl-9 pr-3 bg-white text-black dark:bg-zinc-800 dark:text-white"
            />
          </div>

          <div className="flex flex-1 gap-2">
            <input
              type="text"
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAdd()
                }
              }}
              placeholder="Pievienot jaunu vārdu"
              className="flex-1 rounded border p-2 bg-white text-black dark:bg-zinc-800 dark:text-white"
            />
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-black dark:text-white">
                <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                />
                Visi
            </label>

            <div className="flex items-center gap-2">
                <button
                    onClick={handleAdd}
                    disabled={isSaving}
                    className="inline-flex h-10 w-10 items-center justify-center rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
                    title="Pievienot"
                >
                    <SquarePlus size={18} />
                </button>

                <button
                    onClick={handleDeleteSelected}
                    disabled={selectedWords.length === 0 || isDeleting}
                    className="inline-flex h-10 w-10 items-center justify-center rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    title="Dzēst atlasītos"
                >
                    <Trash2 size={18} />
                </button>
            </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto rounded border dark:border-zinc-700">
          {filteredWords.length === 0 ? (
            <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
              Nekas netika atrasts.
            </div>
          ) : (
            <div className="divide-y dark:divide-zinc-700">
              {filteredWords.map((word) => (
                <label
                  key={word.name}
                  className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-zinc-800"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedWords.includes(word.name)}
                      onChange={() => toggleWord(word.name)}
                    />

                    <span className="truncate text-sm text-black dark:text-white">
                      {word.name}
                    </span>
                  </div>

                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                    {word.usageCount}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}