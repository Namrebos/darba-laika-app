"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ChevronDown,
  Clipboard,
  ExternalLink,
  ImagePlus,
  Link2,
  Mail,
  MessageCircle,
  MessageSquareText,
  Pencil,
  Plus,
  Send,
  Truck,
  X,
} from "lucide-react";
import TransportRequestModal from "@/app/components/TransportRequestModal";
import { addPhotoTimestamp } from "@/lib/addPhotoTimestamp";
import { supabase } from "@/lib/supabaseClient";

type PlannedStatus = "new" | "planned" | "started" | "completed" | "canceled";

type Profile = {
  id: string;
  display_name: string;
  email: string | null;
};

type PlannedTask = {
  id: number;
  created_by: string;
  assignee_id: string;
  title: string;
  note: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  position: number;
  status: PlannedStatus;
  task_log_id: number | null;
  transport_request_id: number | null;
};

type PlannedImage = {
  id: number;
  planned_task_id: number;
  url: string;
};

type DayTab = "planned" | "completed" | "canceled";
type DictionaryField = "title" | "note";

type DictionaryWord = {
  name: string;
  usageCount: number;
};

function todayInRiga() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Riga",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function statusLabel(status: PlannedStatus) {
  const labels: Record<PlannedStatus, string> = {
    new: "Jauns",
    planned: "Plānots",
    started: "Sākts",
    completed: "Pabeigts",
    canceled: "Atcelts",
  };
  return labels[status];
}

function scheduledDateTimeLabel(task: PlannedTask) {
  if (!task.scheduled_date) return "Izvēlēties datumu un laiku";
  const [year, month, day] = task.scheduled_date.split("-");
  const date = `${day}.${month}.${year}.`;
  return task.scheduled_time
    ? `${date} ${task.scheduled_time.slice(0, 5)}`
    : date;
}

export default function PlannedTasksPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<PlannedTask[]>([]);
  const [images, setImages] = useState<Record<number, PlannedImage[]>>({});
  const [selectedDate, setSelectedDate] = useState(todayInRiga());
  const [dayTab, setDayTab] = useState<DayTab>("planned");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [dictionaryWords, setDictionaryWords] = useState<DictionaryWord[]>([]);
  const [activeDictionaryField, setActiveDictionaryField] = useState<{
    taskId: number;
    field: DictionaryField;
    cursor: number;
  } | null>(null);
  const [requestLink, setRequestLink] = useState("");
  const [creatingRequestLink, setCreatingRequestLink] = useState(false);
  const [openedRequestId, setOpenedRequestId] = useState<number | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [scheduleEditor, setScheduleEditor] = useState<{
    taskId: number;
    date: string;
    time: string;
    withoutTime: boolean;
  } | null>(null);

  useEffect(() => {
    async function load() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace("/login");
        return;
      }

      const { data: ownProfile } = await supabase
        .from("profiles")
        .select("role, can_access_planned_tasks")
        .eq("id", authData.user.id)
        .single();

      if (
        ownProfile?.role !== "admin" &&
        ownProfile?.can_access_planned_tasks !== true
      ) {
        router.replace("/summary");
        return;
      }

      const [
        { data: profileRows, error: profileError },
        { data: taskRows, error: taskError },
        { data: imageRows, error: imageError },
        { data: tagRows, error: tagError },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, email")
          .order("display_name"),
        supabase
          .from("planned_tasks")
          .select("*")
          .order("scheduled_date", { ascending: true, nullsFirst: true })
          .order("position", { ascending: true }),
        supabase.from("planned_task_images").select("id, planned_task_id, url"),
        supabase
          .from("tags")
          .select("name, usage_count")
          .eq("user_id", authData.user.id)
          .order("usage_count", { ascending: false }),
      ]);

      if (profileError || taskError || imageError || tagError) {
        setMessage("Neizdevās ielādēt plānotos uzdevumus.");
      }

      setUserId(authData.user.id);
      setProfiles((profileRows || []) as Profile[]);
      setTasks((taskRows || []) as PlannedTask[]);
      setDictionaryWords(
        (tagRows || []).map((word) => ({
          name: word.name,
          usageCount: word.usage_count || 0,
        })),
      );

      const imageMap: Record<number, PlannedImage[]> = {};
      ((imageRows || []) as PlannedImage[]).forEach((image) => {
        if (!imageMap[image.planned_task_id]) {
          imageMap[image.planned_task_id] = [];
        }
        imageMap[image.planned_task_id].push(image);
      });
      setImages(imageMap);
      setLoading(false);
    }

    load();
  }, [router]);

  const newTasks = useMemo(
    () => tasks.filter((task) => task.status === "new"),
    [tasks],
  );

  const selectedDayTasks = useMemo(() => {
    const statuses: PlannedStatus[] =
      dayTab === "planned"
        ? ["planned", "started"]
        : dayTab === "completed"
          ? ["completed"]
          : ["canceled"];

    return tasks
      .filter(
        (task) =>
          task.scheduled_date === selectedDate && statuses.includes(task.status),
      )
      .sort((a, b) => a.position - b.position);
  }, [dayTab, selectedDate, tasks]);

  const dayCounts = useMemo(() => {
    const dayTasks = tasks.filter((task) => task.scheduled_date === selectedDate);
    return {
      planned: dayTasks.filter((task) =>
        ["planned", "started"].includes(task.status),
      ).length,
      completed: dayTasks.filter((task) => task.status === "completed").length,
      canceled: dayTasks.filter((task) => task.status === "canceled").length,
    };
  }, [selectedDate, tasks]);

  function profileName(profileId: string) {
    const profile = profiles.find((item) => item.id === profileId);
    return profile?.display_name || profile?.email || "Nezināms lietotājs";
  }

  function changeLocalTask(id: number, changes: Partial<PlannedTask>) {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, ...changes } : task)),
    );
  }

  async function reloadDictionary() {
    if (!userId) return;
    const { data } = await supabase
      .from("tags")
      .select("name, usage_count")
      .eq("user_id", userId)
      .order("usage_count", { ascending: false });
    setDictionaryWords(
      (data || []).map((word) => ({
        name: word.name,
        usageCount: word.usage_count || 0,
      })),
    );
  }

  async function addDictionaryWord(word: string) {
    const clean = word.trim().replace(/^#+/, "").replace(/\s+/g, "_");
    if (!clean || !userId) return;

    const existing = dictionaryWords.find(
      (item) => item.name.toLowerCase() === clean.toLowerCase(),
    );
    const { error } = existing
      ? await supabase
          .from("tags")
          .update({ usage_count: existing.usageCount + 1 })
          .eq("user_id", userId)
          .eq("name", existing.name)
      : await supabase
          .from("tags")
          .insert({ user_id: userId, name: clean, usage_count: 1 });

    if (error) {
      setMessage("Vārdu neizdevās saglabāt vārdnīcā.");
      return;
    }
    await reloadDictionary();
  }

  function extractHashtagWords(...texts: string[]) {
    const matches = texts.flatMap(
      (text) => text.match(/#([A-Za-zĀ-ž0-9_-]+)/g) || [],
    );
    return [...new Set(matches.map((item) => item.slice(1)).filter(Boolean))];
  }

  const dictionarySuggestions = useMemo(() => {
    if (!activeDictionaryField) return [];
    const task = tasks.find(
      (item) => item.id === activeDictionaryField.taskId,
    );
    if (!task) return [];
    const value =
      activeDictionaryField.field === "title" ? task.title : task.note;
    const before = value.slice(0, activeDictionaryField.cursor);
    const prefix = (before.match(/(^|\s)([^\s]+)$/)?.[2] || "").toLowerCase();
    if (!prefix) return [];
    return dictionaryWords
      .filter((word) => word.name.toLowerCase().startsWith(prefix))
      .filter((word) => word.name.toLowerCase() !== prefix)
      .slice(0, 6);
  }, [activeDictionaryField, dictionaryWords, tasks]);

  function applyDictionarySuggestion(word: string) {
    if (!activeDictionaryField) return;
    const task = tasks.find(
      (item) => item.id === activeDictionaryField.taskId,
    );
    if (!task) return;
    const value =
      activeDictionaryField.field === "title" ? task.title : task.note;
    const cursor = Math.max(
      0,
      Math.min(activeDictionaryField.cursor, value.length),
    );
    let start = cursor;
    while (start > 0 && !/\s/.test(value[start - 1])) start -= 1;
    let end = cursor;
    while (end < value.length && !/\s/.test(value[end])) end += 1;
    const inserted = word.replace(/_/g, " ");
    const nextValue = `${value.slice(0, start)}${inserted} ${value.slice(end)}`;
    changeLocalTask(task.id, {
      [activeDictionaryField.field]: nextValue,
    });
    void addDictionaryWord(word);
    setActiveDictionaryField(null);
  }

  function renderDictionarySuggestions(taskId: number, field: DictionaryField) {
    if (
      activeDictionaryField?.taskId !== taskId ||
      activeDictionaryField.field !== field ||
      dictionarySuggestions.length === 0
    ) {
      return null;
    }

    return (
      <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-zinc-300 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        {dictionarySuggestions.map((word) => (
          <button
            key={word.name}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => applyDictionarySuggestion(word.name)}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {word.name.replace(/_/g, " ")}
          </button>
        ))}
      </div>
    );
  }

  async function createDraft() {
    if (!userId) return;
    setMessage("");
    const defaultAssignee =
      profiles.find((profile) => profile.id === userId)?.id ||
      profiles[0]?.id ||
      userId;
    const { data, error } = await supabase
      .from("planned_tasks")
      .insert({
        created_by: userId,
        assignee_id: defaultAssignee,
        status: "new",
      })
      .select()
      .single();

    if (error || !data) {
      setMessage("Jaunu kartīti neizdevās izveidot.");
      return;
    }
    setTasks((current) => [data as PlannedTask, ...current]);
  }

  async function createRequestLink() {
    setCreatingRequestLink(true);
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch("/api/admin/transport-request-links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
      },
    });
    const result = await response.json();
    setCreatingRequestLink(false);
    if (!response.ok) {
      setMessage(result.error || "Pieteikuma saiti neizdevās izveidot.");
      return;
    }
    setRequestLink(result.requestLink);
    await navigator.clipboard.writeText(result.requestLink);
    setMessage("Pieteikuma saite izveidota un nokopēta.");
  }

  async function copyRequestLink() {
    if (!requestLink) return;
    await navigator.clipboard.writeText(requestLink);
    setMessage("Pieteikuma saite nokopēta.");
  }

  const requestShareText = requestLink
    ? `Lūdzu, aizpildiet kravas pārvadājuma pieteikumu:\n${requestLink}`
    : "";
  const encodedRequestShareText = encodeURIComponent(requestShareText);
  const requestEmailSubject = encodeURIComponent(
    "Kravas pārvadājuma pieteikums",
  );

  async function saveDraft(task: PlannedTask) {
    setSavingId(task.id);
    setMessage("");
    const { error } = await supabase
      .from("planned_tasks")
      .update({
        assignee_id: task.assignee_id,
        title: task.title.trim(),
        note: task.note.trim(),
        scheduled_date: task.scheduled_date || null,
        scheduled_time: task.scheduled_time || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);
    setSavingId(null);
    if (error) setMessage("Kartītes izmaiņas neizdevās saglabāt.");
  }

  async function saveSchedule() {
    if (!scheduleEditor?.date) {
      setMessage("Datums ir obligāts.");
      return;
    }
    const task = tasks.find((item) => item.id === scheduleEditor.taskId);
    if (!task) return;

    const updated = {
      ...task,
      scheduled_date: scheduleEditor.date,
      scheduled_time: scheduleEditor.withoutTime
        ? null
        : scheduleEditor.time || null,
    };
    changeLocalTask(task.id, {
      scheduled_date: updated.scheduled_date,
      scheduled_time: updated.scheduled_time,
    });
    await saveDraft(updated);
    setScheduleEditor(null);
  }

  async function sendTask(task: PlannedTask) {
    if (!task.title.trim() || !task.note.trim() || !task.scheduled_date) {
      setMessage("Pirms nosūtīšanas aizpildi nosaukumu, piezīmes un datumu.");
      return;
    }

    const lastPosition = tasks
      .filter(
        (item) =>
          item.scheduled_date === task.scheduled_date &&
          item.assignee_id === task.assignee_id &&
          item.status !== "canceled",
      )
      .reduce((largest, item) => Math.max(largest, item.position), -1);

    setSavingId(task.id);
    const changes = {
      title: task.title.trim(),
      note: task.note.trim(),
      status: "planned" as const,
      position: lastPosition + 1,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("planned_tasks")
      .update(changes)
      .eq("id", task.id);
    setSavingId(null);

    if (error) {
      setMessage("Kartīti neizdevās nosūtīt.");
      return;
    }

    changeLocalTask(task.id, changes);
    const hashtagWords = extractHashtagWords(task.title, task.note);
    await Promise.all(hashtagWords.map((word) => addDictionaryWord(word)));
    setSelectedDate(task.scheduled_date);
    setDayTab("planned");
    setMessage("Kartīte nosūtīta uz izvēlēto dienu.");
  }

  async function returnForEditing(task: PlannedTask) {
    const changes = {
      status: "new" as const,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("planned_tasks")
      .update(changes)
      .eq("id", task.id);
    if (error) {
      setMessage("Kartīti neizdevās atgriezt rediģēšanai.");
      return;
    }
    changeLocalTask(task.id, changes);
  }

  async function cancelTask(task: PlannedTask) {
    if (!window.confirm(`Vai atcelt uzdevumu “${task.title || "Bez nosaukuma"}”?`)) {
      return;
    }
    const changes = {
      status: "canceled" as const,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("planned_tasks")
      .update(changes)
      .eq("id", task.id);
    if (error) {
      setMessage("Uzdevumu neizdevās atcelt.");
      return;
    }
    changeLocalTask(task.id, changes);
  }

  async function moveTask(task: PlannedTask, direction: -1 | 1) {
    const index = selectedDayTasks.findIndex((item) => item.id === task.id);
    const other = selectedDayTasks[index + direction];
    if (!other) return;

    const firstPosition = task.position;
    const secondPosition = other.position;
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, position: secondPosition }
          : item.id === other.id
            ? { ...item, position: firstPosition }
            : item,
      ),
    );

    const [{ error: firstError }, { error: secondError }] = await Promise.all([
      supabase
        .from("planned_tasks")
        .update({ position: secondPosition, updated_at: new Date().toISOString() })
        .eq("id", task.id),
      supabase
        .from("planned_tasks")
        .update({ position: firstPosition, updated_at: new Date().toISOString() })
        .eq("id", other.id),
    ]);

    if (firstError || secondError) {
      setMessage("Uzdevumu secību neizdevās saglabāt.");
    }
  }

  async function dropTask(targetId: number) {
    if (draggedTaskId === null || draggedTaskId === targetId) {
      setDraggedTaskId(null);
      return;
    }

    const reordered = [...selectedDayTasks];
    const fromIndex = reordered.findIndex((task) => task.id === draggedTaskId);
    const toIndex = reordered.findIndex((task) => task.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;

    const [dragged] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, dragged);
    const positions = new Map(
      reordered.map((task, index) => [task.id, index]),
    );

    setTasks((current) =>
      current.map((task) =>
        positions.has(task.id)
          ? { ...task, position: positions.get(task.id) as number }
          : task,
      ),
    );
    setDraggedTaskId(null);

    const results = await Promise.all(
      reordered.map((task, index) =>
        supabase
          .from("planned_tasks")
          .update({ position: index, updated_at: new Date().toISOString() })
          .eq("id", task.id),
      ),
    );
    if (results.some(({ error }) => error)) {
      setMessage("Uzdevumu secību neizdevās pilnībā saglabāt.");
    }
  }

  async function uploadImages(task: PlannedTask, files: FileList | null) {
    if (!files || files.length === 0 || !userId) return;
    setSavingId(task.id);
    setMessage("");

    for (const originalFile of Array.from(files)) {
      let file = originalFile;
      try {
        file = await addPhotoTimestamp(originalFile);
      } catch (error) {
        console.error("Foto laika pievienošanas kļūda:", error);
      }

      const path = `${userId}/planned/${task.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("task-images")
        .upload(path, file, { contentType: file.type });
      if (uploadError) {
        setMessage("Vienu no attēliem neizdevās augšupielādēt.");
        continue;
      }

      const url = supabase.storage.from("task-images").getPublicUrl(path)
        .data.publicUrl;
      const { data, error } = await supabase
        .from("planned_task_images")
        .insert({ planned_task_id: task.id, uploaded_by: userId, url })
        .select("id, planned_task_id, url")
        .single();
      if (!error && data) {
        setImages((current) => ({
          ...current,
          [task.id]: [...(current[task.id] || []), data as PlannedImage],
        }));
      }
    }

    setSavingId(null);
  }

  async function deleteImage(image: PlannedImage) {
    const marker = "/task-images/";
    const path = image.url.includes(marker)
      ? decodeURIComponent(image.url.split(marker)[1])
      : "";
    if (path) await supabase.storage.from("task-images").remove([path]);
    const { error } = await supabase
      .from("planned_task_images")
      .delete()
      .eq("id", image.id);
    if (error) {
      setMessage("Attēlu neizdevās izdzēst.");
      return;
    }
    setImages((current) => ({
      ...current,
      [image.planned_task_id]: (current[image.planned_task_id] || []).filter(
        (item) => item.id !== image.id,
      ),
    }));
  }

  if (loading) return <p className="p-6">Ielādē...</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Plānotie uzdevumi</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sagatavo, piešķir un sakārto uzdevumu kartītes.
          </p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setNewMenuOpen((current) => !current)}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-green-600 px-3 py-2 font-medium text-white hover:bg-green-700"
            aria-expanded={newMenuOpen}
          >
            <Plus size={18} />
            Jauns
            <ChevronDown size={16} />
          </button>
          {newMenuOpen && (
            <div className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => {
                  setNewMenuOpen(false);
                  void createDraft();
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <Plus size={18} />
                Jauns uzdevums
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewMenuOpen(false);
                  router.push("/planned-tasks/new-trip");
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <Truck size={18} />
                Jauns brauciens
              </button>
              <button
                type="button"
                disabled={creatingRequestLink}
                onClick={() => {
                  setNewMenuOpen(false);
                  void createRequestLink();
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
              >
                <Link2 size={18} />
                {creatingRequestLink ? "Veido saiti..." : "Klienta saite"}
              </button>
            </div>
          )}
        </div>
      </div>

      {message && (
        <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">
          {message}
        </p>
      )}

      {requestLink && (
        <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-900 dark:bg-violet-950/30">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              readOnly
              value={requestLink}
              className="min-w-0 flex-1 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-black"
            />
            <button
              type="button"
              onClick={copyRequestLink}
              className="flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white"
            >
              <Clipboard size={16} />
              Kopēt saiti
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <a
              href={`https://wa.me/?text=${encodedRequestShareText}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-2 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              <MessageCircle size={17} />
              <span className="hidden sm:inline">WhatsApp</span>
              <span className="sm:hidden">WhatsApp</span>
            </a>
            <a
              href={`sms:?&body=${encodedRequestShareText}`}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-2 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <MessageSquareText size={17} />
              SMS
            </a>
            <a
              href={`mailto:?subject=${requestEmailSubject}&body=${encodedRequestShareText}`}
              className="flex items-center justify-center gap-2 rounded-lg bg-zinc-700 px-2 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              <Mail size={17} />
              E-pasts
            </a>
          </div>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">Jaunās kartītes ({newTasks.length})</h2>
        {newTasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">
            Nav sagatavošanā esošu kartīšu.
          </p>
        ) : (
          newTasks.map((task) => (
            <article
              key={task.id}
              className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700"
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                    Jauns
                  </span>
                  {task.transport_request_id && (
                    <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                      Klienta pieteikums
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => cancelTask(task)}
                  className="text-zinc-500 hover:text-red-600"
                  aria-label="Atcelt kartīti"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="relative">
                <input
                  value={task.title}
                  onFocus={(event) =>
                    setActiveDictionaryField({
                      taskId: task.id,
                      field: "title",
                      cursor: event.currentTarget.selectionStart || 0,
                    })
                  }
                  onClick={(event) =>
                    setActiveDictionaryField({
                      taskId: task.id,
                      field: "title",
                      cursor: event.currentTarget.selectionStart || 0,
                    })
                  }
                  onChange={(event) => {
                    changeLocalTask(task.id, { title: event.target.value });
                    setActiveDictionaryField({
                      taskId: task.id,
                      field: "title",
                      cursor:
                        event.currentTarget.selectionStart ||
                        event.currentTarget.value.length,
                    });
                  }}
                  onBlur={() => saveDraft(task)}
                  placeholder="Uzdevuma nosaukums"
                  className="w-full rounded-lg border border-zinc-300 bg-transparent p-2 dark:border-zinc-600"
                />
                {renderDictionarySuggestions(task.id, "title")}
              </div>
              <div className="relative">
                <textarea
                  value={task.note}
                  onFocus={(event) =>
                    setActiveDictionaryField({
                      taskId: task.id,
                      field: "note",
                      cursor: event.currentTarget.selectionStart || 0,
                    })
                  }
                  onClick={(event) =>
                    setActiveDictionaryField({
                      taskId: task.id,
                      field: "note",
                      cursor: event.currentTarget.selectionStart || 0,
                    })
                  }
                  onChange={(event) => {
                    changeLocalTask(task.id, { note: event.target.value });
                    setActiveDictionaryField({
                      taskId: task.id,
                      field: "note",
                      cursor:
                        event.currentTarget.selectionStart ||
                        event.currentTarget.value.length,
                    });
                  }}
                  onBlur={() => saveDraft(task)}
                  placeholder="Piezīmes"
                  rows={4}
                  className="w-full resize-y rounded-lg border border-zinc-300 bg-transparent p-2 dark:border-zinc-600"
                />
                {renderDictionarySuggestions(task.id, "note")}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Lietotājs</span>
                  <select
                    value={task.assignee_id}
                    onChange={(event) => {
                      const updated = {
                        ...task,
                        assignee_id: event.target.value,
                      };
                      changeLocalTask(task.id, {
                        assignee_id: event.target.value,
                      });
                      void saveDraft(updated);
                    }}
                    className="w-full rounded-lg border border-zinc-300 bg-transparent p-2 dark:border-zinc-600"
                  >
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.display_name || profile.email}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setScheduleEditor({
                      taskId: task.id,
                      date: task.scheduled_date || "",
                      time: task.scheduled_time?.slice(0, 5) || "09:00",
                      withoutTime: !task.scheduled_time,
                    })
                  }
                  className="flex min-h-10 items-center gap-2 self-end rounded-lg border border-zinc-300 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                  aria-label="Izvēlēties uzdevuma datumu un laiku"
                >
                  <CalendarClock size={19} className="shrink-0 text-blue-600" />
                  <span className="truncate font-medium">
                    {scheduledDateTimeLabel(task)}
                  </span>
                </button>
              </div>

              {(images[task.id] || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(images[task.id] || []).map((image) => (
                    <div key={image.id} className="relative">
                      <Image
                        src={image.url}
                        alt=""
                        width={72}
                        height={72}
                        unoptimized
                        className="h-18 w-18 rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => deleteImage(image)}
                        className="absolute -right-2 -top-2 rounded-full bg-red-600 p-1 text-white"
                        aria-label="Dzēst attēlu"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600">
                    <ImagePlus size={18} />
                    Pievienot foto
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        void uploadImages(task, event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  {task.transport_request_id && (
                    <button
                      type="button"
                      onClick={() =>
                        setOpenedRequestId(task.transport_request_id)
                      }
                      className="flex items-center gap-2 rounded-lg border border-violet-300 px-3 py-2 text-sm font-semibold text-violet-700 dark:border-violet-800 dark:text-violet-300"
                    >
                      <ExternalLink size={17} />
                      Apskatīt pieteikumu
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  disabled={savingId === task.id}
                  onClick={() => sendTask(task)}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send size={18} />
                  {savingId === task.id ? "Saglabā..." : "Nosūtīt"}
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">Dienas plāns</h2>
            <p className="text-sm text-zinc-500">Izvēlies datumu un sakārto secību.</p>
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="rounded-lg border border-zinc-300 bg-transparent p-2 dark:border-zinc-600"
          />
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          {(
            [
              ["planned", `Plānotie ${dayCounts.planned}`],
              ["completed", `Izpildītie ${dayCounts.completed}`],
              ["canceled", `Atceltie ${dayCounts.canceled}`],
            ] as [DayTab, string][]
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setDayTab(tab)}
              className={`rounded-md px-2 py-2 text-sm font-medium ${
                dayTab === tab
                  ? "bg-white shadow dark:bg-zinc-700"
                  : "text-zinc-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {selectedDayTasks.length === 0 ? (
          <p className="py-4 text-sm text-zinc-500">
            Šajā skatā uzdevumu nav.
          </p>
        ) : (
          <div className="space-y-2">
            {selectedDayTasks.map((task, index) => (
              <article
                key={task.id}
                draggable={dayTab === "planned"}
                onDragStart={() => setDraggedTaskId(task.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => void dropTask(task.id)}
                onDragEnd={() => setDraggedTaskId(null)}
                className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
              >
                <div className="flex items-start gap-3">
                  {dayTab === "planned" && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveTask(task, -1)}
                        className="rounded border p-1 disabled:opacity-30"
                        aria-label="Pārvietot uz augšu"
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        disabled={index === selectedDayTasks.length - 1}
                        onClick={() => moveTask(task, 1)}
                        className="rounded border p-1 disabled:opacity-30"
                        aria-label="Pārvietot uz leju"
                      >
                        <ArrowDown size={16} />
                      </button>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{task.title}</h3>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
                        {statusLabel(task.status)}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">
                      {task.note}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {profileName(task.assignee_id)}
                      {task.scheduled_time
                        ? ` · ${task.scheduled_time.slice(0, 5)}`
                        : ""}
                    </p>
                    {(images[task.id] || []).length > 0 && (
                      <div className="mt-2 flex gap-2 overflow-x-auto">
                        {(images[task.id] || []).map((image) => (
                          <Image
                            key={image.id}
                            src={image.url}
                            alt=""
                            width={56}
                            height={56}
                            unoptimized
                            className="h-14 w-14 shrink-0 rounded object-cover"
                          />
                        ))}
                      </div>
                    )}
                    {task.transport_request_id && (
                      <button
                        type="button"
                        onClick={() =>
                          setOpenedRequestId(task.transport_request_id!)
                        }
                        className="mt-3 flex items-center gap-2 rounded-lg border border-violet-300 px-3 py-2 text-sm font-semibold text-violet-700 dark:border-violet-800 dark:text-violet-300"
                      >
                        <ExternalLink size={16} />
                        Apskatīt pieteikumu
                      </button>
                    )}
                  </div>
                </div>

                {task.status === "planned" && (
                  <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                    <button
                      type="button"
                      onClick={() => returnForEditing(task)}
                      className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
                    >
                      <Pencil size={16} />
                      Atgriezt rediģēšanai
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelTask(task)}
                      className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:text-red-300"
                    >
                      Atcelt
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      {scheduleEditor && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-editor-title"
          onClick={() => setScheduleEditor(null)}
        >
          <div
            className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="schedule-editor-title" className="text-lg font-semibold">
                Datums un laiks
              </h2>
              <button
                type="button"
                onClick={() => setScheduleEditor(null)}
                className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Aizvērt"
              >
                <X size={20} />
              </button>
            </div>

            <label className="block space-y-1 text-sm">
              <span className="font-medium">Datums un laiks *</span>
              <input
                type="datetime-local"
                required
                value={
                  scheduleEditor.date
                    ? `${scheduleEditor.date}T${scheduleEditor.time || "09:00"}`
                    : ""
                }
                onChange={(event) => {
                  const [date, time] = event.target.value.split("T");
                  setScheduleEditor((current) =>
                    current
                      ? {
                          ...current,
                          date: date || "",
                          time: time || current.time,
                        }
                      : null,
                  );
                }}
                className="w-full rounded-lg border border-zinc-300 bg-transparent p-3 dark:border-zinc-600"
              />
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-700">
              <input
                type="checkbox"
                checked={scheduleEditor.withoutTime}
                onChange={(event) =>
                  setScheduleEditor((current) =>
                    current
                      ? { ...current, withoutTime: event.target.checked }
                      : null,
                  )
                }
                className="h-5 w-5 accent-blue-600"
              />
              <span>
                <span className="block font-medium">Bez laika</span>
                <span className="text-xs text-zinc-500">
                  Saglabāt tikai izvēlēto datumu
                </span>
              </span>
            </label>

            <button
              type="button"
              onClick={saveSchedule}
              disabled={!scheduleEditor.date || savingId === scheduleEditor.taskId}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-500"
            >
              {savingId === scheduleEditor.taskId ? "Saglabā..." : "Saglabāt"}
            </button>
          </div>
        </div>
      )}
      <TransportRequestModal
        requestId={openedRequestId}
        onClose={() => setOpenedRequestId(null)}
      />
    </div>
  );
}
