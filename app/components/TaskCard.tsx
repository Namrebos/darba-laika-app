"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import imageCompression from "browser-image-compression";
import { BookOpenText, CirclePlay, OctagonX, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import ImageGalleryModal from "@/app/components/ImageGalleryModal";
import TaskPreviewCard from "@/app/components/TaskPreviewCard";
import TaskDetailsCard from "@/app/components/TaskDetailsCard";
import DictionaryModal from "@/app/components/DictionaryModal";

type Task = {
  id: string;
  title: string;
  notes: string;
  tags: string[];
  images: File[];
  uploadedImageUrls: string[];
  status: "starting" | "active" | "finished" | "review";
  startTime?: Date;
  endTime?: Date;
  supabaseTaskId?: number;
  isCall: boolean;
};

type TimerEntry = {
  id: string;
  label: string;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
};

type DictionaryWord = {
  name: string;
  usageCount: number;
};

type Props = {
  task: Task;
  user: User | null;
  sessionId: number | null;
  updateTask: (id: string, updated: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  dictionaryWords: DictionaryWord[];
  onAddDictionaryWord: (word: string) => Promise<void>;
  onSaveDictionaryWords: (words: string[]) => Promise<void>;
  onDeleteDictionaryWords: (words: string[]) => Promise<void>;
  setSavingTasks: (
    s: (prev: Record<string, boolean>) => Record<string, boolean>,
  ) => void;
  savingTasks: Record<string, boolean>;
  saveTaskToDB: (task: Task) => Promise<void>;
};

type ActiveField = "title" | "notes" | "timer" | null;

export default function TaskCard({
  task,
  user,
  sessionId,
  updateTask,
  deleteTask,
  dictionaryWords,
  onAddDictionaryWord,
  onSaveDictionaryWords,
  onDeleteDictionaryWords,
  setSavingTasks,
  savingTasks,
  saveTaskToDB,
}: Props) {
  const isSaving = savingTasks[task.id] === true;
  const dictionaryNames = useMemo(
    () => dictionaryWords.map((word) => word.name),
    [dictionaryWords],
  );

  const [selectedImages, setSelectedImages] = useState<string[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [localPreviewUrls, setLocalPreviewUrls] = useState<string[]>([]);

  const [timerLabel, setTimerLabel] = useState("");
  const [activeTimerStartedAt, setActiveTimerStartedAt] = useState<Date | null>(
    null,
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerEntries, setTimerEntries] = useState<TimerEntry[]>([]);

  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [titleCursor, setTitleCursor] = useState(0);
  const [notesCursor, setNotesCursor] = useState(0);
  const [timerCursor, setTimerCursor] = useState(0);

  const titleRef = useRef<HTMLInputElement | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const timerRef = useRef<HTMLInputElement | null>(null);
  const isUploadingImagesRef = useRef(false);

  const isTimerRunning = activeTimerStartedAt !== null;

  useEffect(() => {
    const urls = task.images.map((file) => URL.createObjectURL(file));
    setLocalPreviewUrls(urls);

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [task.images]);

  useEffect(() => {
    if (!activeTimerStartedAt) {
      setElapsedSeconds(0);
      return;
    }

    const updateElapsed = () => {
      const diffSeconds = Math.max(
        0,
        Math.floor((Date.now() - activeTimerStartedAt.getTime()) / 1000),
      );
      setElapsedSeconds(diffSeconds);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [activeTimerStartedAt]);

  const loadTaskTimers = useCallback(async () => {
    if (!task.supabaseTaskId) return;

    const { data, error } = await supabase
      .from("task_timers")
      .select("*")
      .eq("task_log_id", task.supabaseTaskId)
      .order("started_at", { ascending: true });

    if (error) {
      console.error("Kļūda ielādējot taimerus:", error.message);
      return;
    }

    if (!data) return;

    const finishedEntries: TimerEntry[] = data
      .filter((row: any) => row.ended_at && row.duration_seconds !== null)
      .map((row: any) => ({
        id: String(row.id),
        label: row.label,
        startedAt: new Date(row.started_at),
        endedAt: new Date(row.ended_at),
        durationSeconds: row.duration_seconds,
      }));

    setTimerEntries(finishedEntries);

    const activeEntry = data.find((row: any) => row.ended_at === null);

    if (activeEntry) {
      setTimerLabel(activeEntry.label);
      setActiveTimerStartedAt(new Date(activeEntry.started_at));
    } else {
      setTimerLabel("");
      setActiveTimerStartedAt(null);
      setElapsedSeconds(0);
    }
  }, [task.supabaseTaskId]);

  useEffect(() => {
    loadTaskTimers();
  }, [loadTaskTimers]);

  useEffect(() => {
    const uploadImages = async () => {
      if (!user || !task.supabaseTaskId) return;
      if (!task.isCall && !sessionId) return;
      if (task.images.length === 0) return;
      if (isUploadingImagesRef.current) return;

      isUploadingImagesRef.current = true;

      const pendingImages = [...task.images];
      const uploadedUrls: string[] = [];
      const successfulImages = new Set<File>();

      for (const image of pendingImages) {
        const basePath = task.isCall
          ? `isCall/${task.supabaseTaskId}`
          : `${sessionId}/${task.supabaseTaskId}`;

        const safeFileName = image.name.replace(/\s+/g, "-");
        const uniqueName =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? `${Date.now()}-${crypto.randomUUID()}-${safeFileName}`
            : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${safeFileName}`;

        const filePath = `${basePath}/${uniqueName}`;

        let fileToUpload: File = image;

        try {
          fileToUpload = await imageCompression(image, {
            maxSizeMB: 1.5,
            maxWidthOrHeight: 1600,
            initialQuality: 0.9,
            useWebWorker: true,
          });
        } catch (compressionError) {
          console.error("Kļūda kompresējot attēlu:", compressionError);
        }

        const { error: uploadError } = await supabase.storage
          .from("task-images")
          .upload(filePath, fileToUpload, {
            contentType: fileToUpload.type,
            upsert: false,
          });

        if (uploadError) {
          console.error("Kļūda augšupielādējot attēlu:", uploadError.message);
          continue;
        }

        const { data: publicUrlData } = supabase.storage
          .from("task-images")
          .getPublicUrl(filePath);

        const publicUrl = publicUrlData?.publicUrl;

        if (!publicUrl) {
          console.error("Neizdevās iegūt public URL attēlam.");
          continue;
        }

        const { error: dbError } = await supabase.from("task_images").insert({
          task_log_id: task.supabaseTaskId,
          user_id: user.id,
          url: publicUrl,
        });

        if (dbError) {
          console.error("Kļūda saglabājot attēlu DB:", dbError.message);
          continue;
        }

        uploadedUrls.push(publicUrl);
        successfulImages.add(image);
      }

      const remainingImages = pendingImages.filter(
        (image) => !successfulImages.has(image),
      );

      updateTask(task.id, {
        uploadedImageUrls: [...task.uploadedImageUrls, ...uploadedUrls],
        images: remainingImages,
      });

      isUploadingImagesRef.current = false;
    };

    uploadImages();
  }, [
    task.images,
    task.supabaseTaskId,
    task.isCall,
    task.uploadedImageUrls,
    task.id,
    sessionId,
    updateTask,
    user,
  ]);

  const closeImageModal = () => {
    setSelectedImages(null);
    setSelectedIndex(0);
  };

  const allGalleryImages = useMemo(() => {
    return [...localPreviewUrls, ...task.uploadedImageUrls];
  }, [localPreviewUrls, task.uploadedImageUrls]);

  const openGallery = (index: number) => {
    if (allGalleryImages.length === 0) return;
    setSelectedImages(allGalleryImages);
    setSelectedIndex(index);
  };

  const formatRunningTimer = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const formatSavedTimer = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  };

  const sortedTimerEntries = useMemo(() => {
    return [...timerEntries].sort(
      (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
    );
  }, [timerEntries]);

  const buildTimeRangeText = () => {
    const start = task.startTime ? new Date(task.startTime) : null;
    const end = task.endTime ? new Date(task.endTime) : null;

    if (!start || !end) return "Nav pilna laika informācija";

    const duration = Math.floor((end.getTime() - start.getTime()) / 60000);
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    const durationText = `${hours}h ${minutes}min`;

    return `${start.toLocaleTimeString("lv-LV", {
      hour: "2-digit",
      minute: "2-digit",
    })}-${end.toLocaleTimeString("lv-LV", {
      hour: "2-digit",
      minute: "2-digit",
    })} (${durationText})`;
  };

  const buildTimerItems = () =>
    sortedTimerEntries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      durationText: formatSavedTimer(entry.durationSeconds),
    }));

  const getActiveValue = () => {
    if (activeField === "title") return task.title;
    if (activeField === "notes") return task.notes;
    if (activeField === "timer") return timerLabel;
    return "";
  };

  const getActiveCursor = () => {
    if (activeField === "title") return titleCursor;
    if (activeField === "notes") return notesCursor;
    if (activeField === "timer") return timerCursor;
    return 0;
  };

  const getCurrentWordPrefix = (value: string, cursor: number) => {
    const safeCursor = Math.max(0, Math.min(cursor, value.length));
    const before = value.slice(0, safeCursor);
    const match = before.match(/(^|\s)([^\s]+)$/);
    return match?.[2] ?? "";
  };

  const currentPrefix = useMemo(() => {
    if (!activeField) return "";
    return getCurrentWordPrefix(getActiveValue(), getActiveCursor());
  }, [
    activeField,
    titleCursor,
    notesCursor,
    timerCursor,
    task.title,
    task.notes,
    timerLabel,
  ]);

  const suggestions = useMemo(() => {
    const prefix = currentPrefix.trim().toLowerCase();

    if (!prefix) return [];

    return dictionaryNames
      .filter((word) => word.toLowerCase().startsWith(prefix))
      .filter((word) => word.toLowerCase() !== prefix)
      .slice(0, 6);
  }, [dictionaryNames, currentPrefix]);

  const replaceWordAtCursor = (
    value: string,
    cursor: number,
    selectedWord: string,
  ) => {
    const safeCursor = Math.max(0, Math.min(cursor, value.length));

    let start = safeCursor;
    while (start > 0 && !/\s/.test(value[start - 1])) {
      start -= 1;
    }

    let end = safeCursor;
    while (end < value.length && !/\s/.test(value[end])) {
      end += 1;
    }

    const before = value.slice(0, start);
    const after = value.slice(end);
    const needsSpaceAfter = after.length === 0 || !after.startsWith(" ");
    const nextValue = `${before}${selectedWord}${needsSpaceAfter ? " " : ""}${after}`;
    const nextCursor =
      before.length + selectedWord.length + (needsSpaceAfter ? 1 : 0);

    return { nextValue, nextCursor };
  };

  const focusFieldAfterInsert = (field: ActiveField, nextCursor: number) => {
    requestAnimationFrame(() => {
      if (field === "title" && titleRef.current) {
        titleRef.current.focus();
        titleRef.current.setSelectionRange(nextCursor, nextCursor);
        setTitleCursor(nextCursor);
      }

      if (field === "notes" && notesRef.current) {
        notesRef.current.focus();
        notesRef.current.setSelectionRange(nextCursor, nextCursor);
        setNotesCursor(nextCursor);
      }

      if (field === "timer" && timerRef.current) {
        timerRef.current.focus();
        timerRef.current.setSelectionRange(nextCursor, nextCursor);
        setTimerCursor(nextCursor);
      }
    });
  };

  const applySuggestion = async (selectedWord: string) => {
    if (!activeField) return;

    if (activeField === "title") {
      const { nextValue, nextCursor } = replaceWordAtCursor(
        task.title,
        titleCursor,
        selectedWord,
      );
      updateTask(task.id, { title: nextValue });
      focusFieldAfterInsert("title", nextCursor);
    }

    if (activeField === "notes") {
      const { nextValue, nextCursor } = replaceWordAtCursor(
        task.notes,
        notesCursor,
        selectedWord,
      );
      updateTask(task.id, { notes: nextValue });
      focusFieldAfterInsert("notes", nextCursor);
    }

    if (activeField === "timer") {
      const { nextValue, nextCursor } = replaceWordAtCursor(
        timerLabel,
        timerCursor,
        selectedWord,
      );
      setTimerLabel(nextValue);
      focusFieldAfterInsert("timer", nextCursor);
    }

    if (user) {
      await onAddDictionaryWord(selectedWord);
    }
  };

  const extractHashtagWords = (...texts: string[]) => {
    const matches = texts.flatMap(
      (text) => text.match(/#([A-Za-zĀ-ž0-9_-]+)/g) || [],
    );

    return [
      ...new Set(matches.map((item) => item.slice(1).trim()).filter(Boolean)),
    ];
  };

  const handleStartTimer = async () => {
    const cleanLabel = timerLabel.trim();

    if (!cleanLabel) {
      alert("Lūdzu ievadi taimera nosaukumu!");
      return;
    }

    if (!task.supabaseTaskId) {
      alert(
        "Vispirms aizpildi uzdevuma nosaukumu un piezīmes, lai uzdevums tiktu saglabāts.",
      );
      return;
    }

    if (isTimerRunning) return;

    const now = new Date();

    const { error } = await supabase.from("task_timers").insert({
      task_log_id: task.supabaseTaskId,
      label: cleanLabel,
      started_at: now.toISOString(),
    });

    if (error) {
      console.error("Timer start error:", error.message);
      return;
    }

    setActiveTimerStartedAt(now);
    setElapsedSeconds(0);
  };

  const handleStopTimer = async () => {
    if (!activeTimerStartedAt || !task.supabaseTaskId) return;

    const endedAt = new Date();
    const durationSeconds = Math.max(
      0,
      Math.floor((endedAt.getTime() - activeTimerStartedAt.getTime()) / 1000),
    );

    const currentStartedAt = activeTimerStartedAt;
    const currentLabel = timerLabel;

    setActiveTimerStartedAt(null);
    setElapsedSeconds(0);
    setTimerLabel("");

    const { error } = await supabase
      .from("task_timers")
      .update({
        ended_at: endedAt.toISOString(),
        duration_seconds: durationSeconds,
      })
      .eq("task_log_id", task.supabaseTaskId)
      .is("ended_at", null);

    if (error) {
      console.error("Timer stop error:", error.message);
      setActiveTimerStartedAt(currentStartedAt);
      setTimerLabel(currentLabel);
      setElapsedSeconds(
        Math.max(
          0,
          Math.floor((Date.now() - currentStartedAt.getTime()) / 1000),
        ),
      );
      return;
    }

    await loadTaskTimers();
  };

  const handleDeleteTimer = async (timerId: string) => {
    const timerToDelete = timerEntries.find((entry) => entry.id === timerId);
    if (!timerToDelete) return;

    setTimerEntries((prev) => prev.filter((entry) => entry.id !== timerId));

    const { error } = await supabase
      .from("task_timers")
      .delete()
      .eq("id", timerId);

    if (error) {
      console.error("Timer delete error:", error.message);
      setTimerEntries((prev) =>
        [...prev, timerToDelete].sort(
          (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
        ),
      );
    }
  };

  const handleRemoveUploadedImage = async (urlToDelete: string) => {
    if (!user || !task.supabaseTaskId) return;
    if (!task.isCall && !sessionId) return;

    const fileName = urlToDelete.split("/").pop()?.split("?")[0];

    if (fileName) {
      const basePath = task.isCall
        ? `isCall/${task.supabaseTaskId}`
        : `${sessionId}/${task.supabaseTaskId}`;

      const storagePath = `${basePath}/${fileName}`;

      const { error: storageError } = await supabase.storage
        .from("task-images")
        .remove([storagePath]);

      if (storageError) {
        console.error("Kļūda dzēšot attēlu no storage:", storageError.message);
      }
    }

    const { error: dbError } = await supabase
      .from("task_images")
      .delete()
      .eq("task_log_id", task.supabaseTaskId)
      .eq("url", urlToDelete);

    if (dbError) {
      console.error("Kļūda dzēšot attēlu no DB:", dbError.message);
    }

    const updated = task.uploadedImageUrls.filter((url) => url !== urlToDelete);
    updateTask(task.id, { uploadedImageUrls: updated });
  };

  const handleFinish = async () => {
    const titleFilled = task.title.trim().length > 0;
    const notesFilled = task.notes.trim().length > 0;

    if (!titleFilled && !notesFilled) {
      const shouldDelete = window.confirm(
        "Uzdevums netiks saglabāts.\n\nVai dzēst šo uzdevumu?",
      );
      if (shouldDelete) deleteTask(task.id);
      return;
    }

    if (!titleFilled || !notesFilled) {
      alert("Lūdzu aizpildi gan uzdevuma nosaukumu, gan piezīmes!");
      return;
    }

    if (isTimerRunning) {
      alert("Vispirms apturi aktīvo taimeri!");
      return;
    }

    setSavingTasks((prev) => ({ ...prev, [task.id]: true }));

    try {
      const endTime = new Date();
      updateTask(task.id, { status: "finished", endTime });

      if (user) {
        const timerLabels = timerEntries.map((timer) => timer.label);
        const hashtagWords = extractHashtagWords(
          task.title,
          task.notes,
          ...timerLabels,
        );

        if (hashtagWords.length > 0) {
          await onSaveDictionaryWords(hashtagWords);
        }
      }

      if (user && task.isCall) {
        await saveTaskToDB({ ...task, endTime, status: "finished" });
      }
    } finally {
      setSavingTasks((prev) => ({ ...prev, [task.id]: false }));
    }
  };

  const renderSuggestions = () => {
    if (suggestions.length === 0 || !activeField) return null;

    return (
      <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded border bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        {suggestions.map((word) => (
          <button
            key={word}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applySuggestion(word)}
            className="block w-full px-3 py-2 text-left text-sm text-black hover:bg-cyan-50 dark:text-white dark:hover:bg-zinc-800"
          >
            {word}
          </button>
        ))}
      </div>
    );
  };

  if (task.status === "starting") {
    return (
      <button
        onClick={() =>
          updateTask(task.id, { status: "active", startTime: new Date() })
        }
        className="rounded bg-green-600 px-4 py-2 text-white"
      >
        Sākt uzdevumu
      </button>
    );
  }

  const renderTimerBlock = (readonly: boolean) => (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {!readonly && (
          <button
            type="button"
            onClick={isTimerRunning ? handleStopTimer : handleStartTimer}
            disabled={!task.supabaseTaskId}
            className={`flex h-12 w-12 min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full text-white touch-manipulation ${
              isTimerRunning
                ? "bg-red-600 hover:bg-red-700"
                : "bg-green-500 hover:bg-green-600"
            } ${!task.supabaseTaskId ? "cursor-not-allowed opacity-40" : ""}`}
            title={
              !task.supabaseTaskId
                ? "Vispirms aizpildi nosaukumu un piezīmes"
                : ""
            }
          >
            {isTimerRunning ? <OctagonX size={22} /> : <CirclePlay size={22} />}
          </button>
        )}

        <div className="min-w-0">
          <div className="text-3xl font-semibold text-black dark:text-white">
            {formatRunningTimer(elapsedSeconds)}
          </div>
          {isTimerRunning && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Aktīvs taimeris: {timerLabel}
            </p>
          )}
        </div>
      </div>

      {!readonly && (
        <div className="relative">
          <input
            ref={timerRef}
            type="text"
            placeholder="Taimera nosaukums"
            value={timerLabel}
            onChange={(e) => {
              setTimerLabel(e.target.value);
              setTimerCursor(e.target.selectionStart ?? e.target.value.length);
            }}
            onFocus={(e) => {
              setActiveField("timer");
              setTimerCursor(e.target.selectionStart ?? e.target.value.length);
            }}
            onClick={(e) =>
              setTimerCursor((e.target as HTMLInputElement).selectionStart ?? 0)
            }
            onKeyUp={(e) =>
              setTimerCursor((e.target as HTMLInputElement).selectionStart ?? 0)
            }
            readOnly={isTimerRunning}
            className="w-full rounded border p-2 bg-white text-black dark:bg-zinc-800 dark:text-white"
          />
          {activeField === "timer" && renderSuggestions()}
        </div>
      )}

      {sortedTimerEntries.length > 0 && (
        <div className="space-y-2 text-sm text-gray-800 dark:text-gray-200">
          <div className="font-semibold">Taimeri</div>

          <div className="space-y-1 pl-1">
            {sortedTimerEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <span className="text-base leading-none">○</span>
                  <span className="font-mono">
                    {formatSavedTimer(entry.durationSeconds)}
                  </span>
                  <span className="truncate text-gray-500 dark:text-gray-400">
                    {entry.label}
                  </span>
                </div>

                {!readonly && (
                  <button
                    type="button"
                    onClick={() => handleDeleteTimer(entry.id)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gray-200 text-black hover:bg-gray-300 dark:bg-zinc-700 dark:text-white dark:hover:bg-zinc-600"
                    title="Dzēst taimeri"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderTaskForm = (readonly: boolean) => (
    <>
      <div className="space-y-4 overflow-x-hidden rounded border p-4">
        <div className="flex items-start gap-2">
          <div className="relative flex-1">
            <input
              ref={titleRef}
              type="text"
              placeholder="Uzdevuma nosaukums"
              className="w-full rounded border p-2 bg-white text-black dark:bg-zinc-800 dark:text-white"
              value={task.title}
              onChange={(e) => {
                if (!readonly) {
                  updateTask(task.id, { title: e.target.value });
                  setTitleCursor(
                    e.target.selectionStart ?? e.target.value.length,
                  );
                }
              }}
              onFocus={(e) => {
                setActiveField("title");
                setTitleCursor(
                  e.target.selectionStart ?? e.target.value.length,
                );
              }}
              onClick={(e) =>
                setTitleCursor(
                  (e.target as HTMLInputElement).selectionStart ?? 0,
                )
              }
              onKeyUp={(e) =>
                setTitleCursor(
                  (e.target as HTMLInputElement).selectionStart ?? 0,
                )
              }
              readOnly={readonly}
            />
            {activeField === "title" && renderSuggestions()}
          </div>

          {!readonly && (
            <>
              <button
                type="button"
                onClick={() => setDictionaryOpen(true)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-cyan-600 text-white hover:bg-cyan-700"
                title="Atvērt vārdnīcu"
              >
                <BookOpenText size={18} />
              </button>

              <button
                disabled={isSaving}
                onClick={handleFinish}
                className={`rounded px-4 py-2 text-white ${
                  isSaving ? "bg-gray-500" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {isSaving ? "Saglabājas..." : "Pabeigt"}
              </button>

              <button
                className="flex h-10 w-10 items-center justify-center rounded bg-gray-200 text-black hover:bg-gray-300"
                onClick={() => deleteTask(task.id)}
                title="Dzēst uzdevumu"
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>

        <div className="space-y-4 min-w-0">
          <div className="min-w-0 space-y-4">
            <div className="relative">
              <textarea
                ref={notesRef}
                placeholder="Piezīmes"
                className="h-28 w-full resize-none rounded border p-2 bg-white text-black dark:bg-zinc-800 dark:text-white"
                value={task.notes}
                onFocus={(e) => {
                  setActiveField("notes");
                  setNotesCursor(
                    e.target.selectionStart ?? e.target.value.length,
                  );
                }}
                onChange={(e) => {
                  if (!readonly) {
                    updateTask(task.id, { notes: e.target.value });
                    setNotesCursor(
                      e.target.selectionStart ?? e.target.value.length,
                    );
                  }
                }}
                onClick={(e) =>
                  setNotesCursor(
                    (e.target as HTMLTextAreaElement).selectionStart ?? 0,
                  )
                }
                onKeyUp={(e) =>
                  setNotesCursor(
                    (e.target as HTMLTextAreaElement).selectionStart ?? 0,
                  )
                }
                readOnly={readonly}
              />
              {activeField === "notes" && renderSuggestions()}
            </div>

            {renderTimerBlock(readonly)}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {!readonly && (
            <label className="cursor-pointer rounded bg-cyan-500 px-4 py-2 text-white">
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    const newFiles = Array.from(e.target.files);
                    const total =
                      task.images.length + task.uploadedImageUrls.length;
                    const available = 5 - total;

                    if (available <= 0) {
                      alert("Maksimālais attēlu skaits ir 5!");
                      return;
                    }

                    const allowed = newFiles.slice(0, available);

                    if (allowed.length < newFiles.length) {
                      alert(`Var pievienot tikai vēl ${available} attēlu(s)!`);
                    }

                    updateTask(task.id, {
                      images: [...task.images, ...allowed],
                    });
                  }
                }}
              />
              Pievienot attēlus
            </label>
          )}

          <div className="flex flex-wrap gap-2">
            {!readonly &&
              localPreviewUrls.map((previewUrl, idx) => (
                <div key={idx} className="relative h-16 w-16">
                  <img
                    src={previewUrl}
                    alt="Jauns attēls"
                    className="h-16 w-16 cursor-pointer rounded object-cover"
                    onClick={() => openGallery(idx)}
                  />
                  <button
                    className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-black bg-opacity-70 text-xs text-white"
                    onClick={() => {
                      const updated = [...task.images];
                      updated.splice(idx, 1);
                      updateTask(task.id, { images: updated });
                    }}
                    title="Dzēst attēlu"
                  >
                    ×
                  </button>
                </div>
              ))}

            {task.uploadedImageUrls.map((url, idx) => (
              <div key={idx} className="relative h-16 w-16">
                <img
                  src={url}
                  alt="Attēls"
                  className="h-16 w-16 cursor-pointer rounded object-cover"
                  onClick={() => openGallery(localPreviewUrls.length + idx)}
                />
                {!readonly && (
                  <button
                    className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-black bg-opacity-70 text-xs text-white"
                    onClick={() => handleRemoveUploadedImage(url)}
                    title="Dzēst augšupielādēto attēlu"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <DictionaryModal
        open={dictionaryOpen}
        onClose={() => setDictionaryOpen(false)}
        words={dictionaryWords}
        onAddWord={onAddDictionaryWord}
        onDeleteWords={onDeleteDictionaryWords}
      />

      <ImageGalleryModal
        images={selectedImages}
        selectedIndex={selectedIndex}
        setSelectedIndex={setSelectedIndex}
        onClose={closeImageModal}
      />
    </>
  );

  if (task.status === "active") return renderTaskForm(false);

  if (task.status === "review") {
    return (
      <>
        <TaskDetailsCard
          title={task.title}
          notes={task.notes}
          timeRangeText={buildTimeRangeText()}
          timers={buildTimerItems()}
          imageUrls={task.uploadedImageUrls}
          onOpenImage={(index) => openGallery(index)}
          onClose={() => updateTask(task.id, { status: "finished" })}
          badgeText={task.isCall ? "izsaukums" : undefined}
        />

        <ImageGalleryModal
          images={selectedImages}
          selectedIndex={selectedIndex}
          setSelectedIndex={setSelectedIndex}
          onClose={closeImageModal}
        />
      </>
    );
  }

  if (task.status === "finished") {
    return (
      <>
        <TaskPreviewCard
          title={task.title}
          timeRangeText={buildTimeRangeText()}
          imageUrls={task.uploadedImageUrls}
          onOpenImage={(index) => openGallery(index)}
          onOpenDetails={() => updateTask(task.id, { status: "review" })}
          badgeText={task.isCall ? "izsaukums" : undefined}
        />

        <ImageGalleryModal
          images={selectedImages}
          selectedIndex={selectedIndex}
          setSelectedIndex={setSelectedIndex}
          onClose={closeImageModal}
        />
      </>
    );
  }

  return null;
}
