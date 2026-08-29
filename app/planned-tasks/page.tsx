"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
  Trash2,
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
  role: "admin" | "member" | "viewer";
  can_access_workday: boolean;
};

type PlannedTask = {
  id: number;
  created_by: string;
  assignee_id: string | null;
  title: string;
  note: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  position: number;
  status: PlannedStatus;
  task_log_id: number | null;
  transport_request_id: number | null;
  vehicle_id: number | null;
  viewed_at: string | null;
  updated_at: string;
};

type Vehicle = {
  id: number;
  registration_number: string;
  display_name: string;
  usage_count: number;
  last_used_at: string | null;
};

type PlannedImage = {
  id: number;
  planned_task_id: number;
  url: string;
};

type DayTab = "planned" | "completed" | "canceled";
type InboxTab = "planned" | "new";
type DictionaryField = "title" | "note";

type DictionaryWord = {
  name: string;
  usageCount: number;
};

type MultiDateMode = "manual" | "range" | "month";
type MultiDateConfig = {
  enabled: boolean;
  mode: MultiDateMode;
  manualMonth: string;
  manualDates: string[];
  from: string;
  to: string;
  month: string;
  weekdays: number[];
};

function dateFromParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function shortDateLabel(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}.`;
}

function calendarDays(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const firstWeekday = new Date(year, month - 1, 1, 12).getDay();
  const leadingEmptyDays = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const daysInMonth = new Date(year, month, 0, 12).getDate();
  return [
    ...Array.from({ length: leadingEmptyDays }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) =>
      dateKey(new Date(year, month - 1, index + 1, 12)),
    ),
  ];
}

function adjacentMonth(monthValue: string, offset: number) {
  const [year, month] = monthValue.split("-").map(Number);
  const result = new Date(year, month - 1 + offset, 1, 12);
  return `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  return new Intl.DateTimeFormat("lv-LV", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1, 12));
}

function selectedDates(config: MultiDateConfig) {
  if (config.mode === "manual") {
    return [...new Set(config.manualDates)].sort();
  }
  let from = config.from;
  let to = config.to;
  if (config.mode === "month" && config.month) {
    const [year, month] = config.month.split("-").map(Number);
    from = `${config.month}-01`;
    to = dateKey(new Date(year, month, 0, 12));
  }
  if (!from || !to || from > to) return [];
  const result: string[] = [];
  const cursor = dateFromParts(from);
  const end = dateFromParts(to);
  while (cursor <= end) {
    const weekday = cursor.getDay();
    if (weekday >= 1 && weekday <= 5 && config.weekdays.includes(weekday)) {
      result.push(dateKey(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

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

function notePreview(value: string) {
  const symbols = Array.from(value.trim());
  if (symbols.length === 0) return "Nav piezīmju";
  return symbols.length > 30
    ? `${symbols.slice(0, 30).join("")}...`
    : symbols.join("");
}

export default function PlannedTasksPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [tasks, setTasks] = useState<PlannedTask[]>([]);
  const [images, setImages] = useState<Record<number, PlannedImage[]>>({});
  const [selectedDate, setSelectedDate] = useState(todayInRiga());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [dayTab, setDayTab] = useState<DayTab>("planned");
  const [inboxTab, setInboxTab] = useState<InboxTab>("planned");
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
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [dayPlanExpanded, setDayPlanExpanded] = useState(false);
  const [inboxExpanded, setInboxExpanded] = useState(false);
  const [modalTaskId, setModalTaskId] = useState<number | null>(null);
  const [multiDateConfigs, setMultiDateConfigs] = useState<
    Record<number, MultiDateConfig>
  >({});

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
        { data: vehicleRows, error: vehicleError },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, email, role, can_access_workday")
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
        supabase
          .from("vehicles")
          .select(
            "id, registration_number, display_name, usage_count, last_used_at",
          )
          .eq("is_active", true)
          .order("usage_count", { ascending: false })
          .order("last_used_at", { ascending: false, nullsFirst: false })
          .order("registration_number"),
      ]);

      if (
        profileError ||
        taskError ||
        imageError ||
        tagError ||
        vehicleError
      ) {
        setMessage("Neizdevās ielādēt plānotos uzdevumus.");
      }

      setUserId(authData.user.id);
      const loadedProfiles = (profileRows || []) as Profile[];
      setProfiles(loadedProfiles);
      const employees = loadedProfiles.filter(
        (profile) =>
          profile.role === "admin" || profile.can_access_workday === true,
      );
      setSelectedEmployeeId(
        employees.find((profile) => profile.id === authData.user.id)?.id ||
          employees[0]?.id ||
          "",
      );
      setTasks((taskRows || []) as PlannedTask[]);
      setVehicles((vehicleRows || []) as Vehicle[]);
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

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (loading || tasks.length === 0) return;

    const parameters = new URLSearchParams(window.location.search);
    const requestedTaskId = Number(parameters.get("plannedTask")) || null;
    const requestedRequestId = Number(parameters.get("transportRequest")) || null;
    const targetTask = tasks.find(
      (task) =>
        task.id === requestedTaskId ||
        task.transport_request_id === requestedRequestId,
    );

    if (!targetTask) return;

    setInboxTab(targetTask.viewed_at ? "planned" : "new");
    setInboxExpanded(true);
    setExpandedTaskIds((current) => new Set(current).add(targetTask.id));
    window.setTimeout(() => {
      document
        .getElementById(`planned-task-${targetTask.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [loading, tasks]);

  const newTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.status === "new")
        .sort((a, b) => {
          if (Boolean(a.viewed_at) !== Boolean(b.viewed_at)) {
            return a.viewed_at ? 1 : -1;
          }
          return b.updated_at.localeCompare(a.updated_at);
        }),
    [tasks],
  );

  const inboxCounts = useMemo(
    () => ({
      planned: newTasks.filter((task) => Boolean(task.viewed_at)).length,
      new: newTasks.filter((task) => !task.viewed_at).length,
    }),
    [newTasks],
  );

  const visibleInboxTasks = useMemo(
    () =>
      newTasks.filter((task) =>
        inboxTab === "new" ? !task.viewed_at : Boolean(task.viewed_at),
      ),
    [inboxTab, newTasks],
  );

  const displayedInboxTasks = useMemo(
    () =>
      modalTaskId === null
        ? visibleInboxTasks
        : newTasks.filter((task) => task.id === modalTaskId),
    [modalTaskId, newTasks, visibleInboxTasks],
  );

  const employeeProfiles = useMemo(() => {
    const assignedEmployeeIds = new Set(
      tasks
        .filter((task) => task.scheduled_date === selectedDate)
        .map((task) => task.assignee_id),
    );

    return profiles.filter(
      (profile) =>
        assignedEmployeeIds.has(profile.id) &&
        (profile.role === "admin" || profile.can_access_workday === true),
    );
  }, [profiles, selectedDate, tasks]);

  useEffect(() => {
    if (
      employeeProfiles.length > 0 &&
      !employeeProfiles.some((profile) => profile.id === selectedEmployeeId)
    ) {
      setSelectedEmployeeId(employeeProfiles[0].id);
    }
    if (employeeProfiles.length === 0 && selectedEmployeeId) {
      setSelectedEmployeeId("");
    }
  }, [employeeProfiles, selectedEmployeeId]);

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
          task.scheduled_date === selectedDate &&
          task.assignee_id === selectedEmployeeId &&
          statuses.includes(task.status),
      )
      .sort((a, b) => a.position - b.position);
  }, [dayTab, selectedDate, selectedEmployeeId, tasks]);

  const dayCounts = useMemo(() => {
    const dayTasks = tasks.filter(
      (task) =>
        task.scheduled_date === selectedDate &&
        task.assignee_id === selectedEmployeeId,
    );
    return {
      planned: dayTasks.filter((task) =>
        ["planned", "started"].includes(task.status),
      ).length,
      completed: dayTasks.filter((task) => task.status === "completed").length,
      canceled: dayTasks.filter((task) => task.status === "canceled").length,
    };
  }, [selectedDate, selectedEmployeeId, tasks]);

  function nextTimeForDate(date: string, excludedTaskId?: number) {
    const latestMinutes = tasks
      .filter(
        (task) =>
          task.id !== excludedTaskId &&
          task.scheduled_date === date &&
          task.status !== "canceled" &&
          task.scheduled_time,
      )
      .map((task) => {
        const [hours, minutes] = task.scheduled_time!.slice(0, 5).split(":");
        return Number(hours) * 60 + Number(minutes);
      })
      .reduce((latest, minutes) => Math.max(latest, minutes), -1);

    if (latestMinutes < 0) return "09:00";
    const nextMinutes = Math.min(latestMinutes + 60, 23 * 60 + 59);
    return `${String(Math.floor(nextMinutes / 60)).padStart(2, "0")}:${String(nextMinutes % 60).padStart(2, "0")}`;
  }

  function profileName(profileId: string | null) {
    if (!profileId) return "Nav piešķirts";
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
    const temporaryId = -Date.now();
    const now = new Date().toISOString();
    const temporaryTask: PlannedTask = {
      id: temporaryId,
      created_by: userId,
      assignee_id: null,
      title: "",
      note: "",
      scheduled_date: null,
      scheduled_time: null,
      position: 0,
      status: "new",
      task_log_id: null,
      transport_request_id: null,
      vehicle_id: null,
      viewed_at: now,
      updated_at: now,
    };
    setTasks((current) => [temporaryTask, ...current]);
    setModalTaskId(temporaryId);
    setExpandedTaskIds((current) => new Set(current).add(temporaryId));
  }

  async function markTaskViewed(task: PlannedTask) {
    if (task.viewed_at) return;
    const viewedAt = new Date().toISOString();
    changeLocalTask(task.id, { viewed_at: viewedAt });
    const { error } = await supabase
      .from("planned_tasks")
      .update({ viewed_at: viewedAt })
      .eq("id", task.id);
    if (error) changeLocalTask(task.id, { viewed_at: null });
  }

  async function toggleTask(task: PlannedTask) {
    const isExpanded = expandedTaskIds.has(task.id);
    if (isExpanded) {
      let closingTaskId = task.id;
      if (task.id < 0) {
        if (!task.title.trim() || !task.note.trim()) {
          setMessage("Nosaukums un piezīmes ir obligāti.");
          return;
        }
        setSavingId(task.id);
        const persistedTask = await persistTemporaryTask(task);
        setSavingId(null);
        if (!persistedTask) return;
        closingTaskId = persistedTask.id;
      } else {
        const saved = await saveDraft(task);
        if (!saved) return;
      }
      setModalTaskId((current) => current === task.id ? null : current);
      setExpandedTaskIds((current) => {
        const next = new Set(current);
        next.delete(task.id);
        next.delete(closingTaskId);
        return next;
      });
      if (!task.viewed_at) void markTaskViewed(task);
      setMessage("Kartītes izmaiņas saglabātas.");
      return;
    }
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      next.add(task.id);
      return next;
    });
  }

  function toggleInbox() {
    if (!inboxExpanded) {
      setInboxTab(inboxCounts.new > 0 ? "new" : "planned");
    }
    setInboxExpanded((current) => !current);
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

  function isTaskReadyToPlan(task: PlannedTask) {
    return Boolean(
      task.title.trim() &&
        task.note.trim() &&
        task.assignee_id &&
        task.scheduled_date,
    );
  }

  async function persistTemporaryTask(task: PlannedTask) {
    if (task.id >= 0) return task;
    const { data, error } = await supabase
      .from("planned_tasks")
      .insert({
        created_by: userId,
        assignee_id: task.assignee_id,
        title: task.title.trim(),
        note: task.note.trim(),
        scheduled_date: task.scheduled_date,
        scheduled_time: task.scheduled_time,
        position: task.position,
        status: "new",
        vehicle_id: task.vehicle_id,
        viewed_at: task.viewed_at || new Date().toISOString(),
      })
      .select()
      .single();
    if (error || !data) {
      setMessage("Kartīti neizdevās saglabāt.");
      return null;
    }

    const persistedTask = data as PlannedTask;
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? persistedTask : item)),
    );
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      next.delete(task.id);
      next.add(persistedTask.id);
      return next;
    });
    setModalTaskId((current) =>
      current === task.id ? persistedTask.id : current,
    );
    setMultiDateConfigs((current) => {
      const config = current[task.id];
      if (!config) return current;
      const next = { ...current, [persistedTask.id]: config };
      delete next[task.id];
      return next;
    });
    return persistedTask;
  }

  async function saveDraft(task: PlannedTask) {
    if (task.id < 0) return true;
    setSavingId(task.id);
    setMessage("");
    const updatedAt = new Date().toISOString();
    const changes = {
      assignee_id: task.assignee_id,
      title: task.title.trim(),
      note: task.note.trim(),
      scheduled_date: task.scheduled_date || null,
      scheduled_time: task.scheduled_time || null,
      vehicle_id: task.vehicle_id,
      status: task.status,
      position: task.position,
      updated_at: updatedAt,
    };
    const { error } = await supabase
      .from("planned_tasks")
      .update(changes)
      .eq("id", task.id);
    setSavingId(null);
    if (error) {
      setMessage("Kartītes izmaiņas neizdevās saglabāt.");
      return false;
    }
    changeLocalTask(task.id, changes);
    return true;
  }

  function changeSchedule(task: PlannedTask, value: string) {
    const [date, time] = value.split("T");
    if (!date) {
      setMessage("Datums ir obligāts.");
      return;
    }

    const updated = {
      ...task,
      scheduled_date: date,
      scheduled_time: time || null,
    };
    changeLocalTask(task.id, {
      scheduled_date: updated.scheduled_date,
      scheduled_time: updated.scheduled_time,
    });
  }

  function updateMultiDateConfig(
    task: PlannedTask,
    updates: Partial<MultiDateConfig>,
  ) {
    const baseDate = task.scheduled_date || selectedDate;
    setMultiDateConfigs((current) => {
      const defaults: MultiDateConfig = {
        enabled: false,
        mode: "manual",
        manualMonth: baseDate.slice(0, 7),
        manualDates: task.scheduled_date ? [task.scheduled_date] : [],
        from: baseDate,
        to: baseDate,
        month: baseDate.slice(0, 7),
        weekdays: [1, 2, 3, 4, 5],
      };
      return {
        ...current,
        [task.id]: {
          ...(current[task.id] || defaults),
        ...updates,
        },
      };
    });
  }

  async function sendTaskToMultipleDates(
    task: PlannedTask,
    config: MultiDateConfig,
  ) {
    const dates = selectedDates(config);
    if (!task.title.trim() || !task.assignee_id) {
      setMessage("Aizpildi nosaukumu un izvēlies lietotāju.");
      return;
    }
    if (dates.length === 0) {
      setMessage("Izvēlies vismaz vienu datumu.");
      return;
    }
    if (dates.length > 62) {
      setMessage("Vienā reizē var izveidot ne vairāk kā 62 kartītes.");
      return;
    }

    setSavingId(task.id);
    setMessage("");
    const rows = dates.map((date) => {
      const position =
        tasks
          .filter(
            (item) =>
              item.scheduled_date === date &&
              item.assignee_id === task.assignee_id &&
              item.status !== "canceled",
          )
          .reduce((largest, item) => Math.max(largest, item.position), -1) + 1;
      return {
        created_by: userId,
        assignee_id: task.assignee_id,
        title: task.title.trim(),
        note: task.note.trim(),
        scheduled_date: date,
        scheduled_time: task.scheduled_time,
        vehicle_id: task.vehicle_id,
        position,
        status: "planned" as const,
      };
    });

    const first = rows[0];
    const { error: updateError } = await supabase
      .from("planned_tasks")
      .update({ ...first, updated_at: new Date().toISOString() })
      .eq("id", task.id);
    if (updateError) {
      setSavingId(null);
      setMessage("Kartītes neizdevās izveidot.");
      return;
    }

    let duplicateRows: PlannedTask[] = [];
    if (rows.length > 1) {
      const { data, error } = await supabase
        .from("planned_tasks")
        .insert(rows.slice(1))
        .select();
      if (error) {
        await supabase
          .from("planned_tasks")
          .update({ status: "new" })
          .eq("id", task.id);
        setSavingId(null);
        setMessage("Daļu kartīšu neizdevās izveidot.");
        return;
      }
      duplicateRows = (data || []) as PlannedTask[];
    }

    const sourceImages = images[task.id] || [];
    if (sourceImages.length > 0 && duplicateRows.length > 0) {
      await supabase.from("planned_task_images").insert(
        duplicateRows.flatMap((duplicate) =>
          sourceImages.map((image) => ({
            planned_task_id: duplicate.id,
            uploaded_by: userId,
            url: image.url,
          })),
        ),
      );
    }

    const updatedOriginal = { ...task, ...first } as PlannedTask;
    setTasks((current) => [
      ...current.map((item) =>
        item.id === task.id ? updatedOriginal : item,
      ),
      ...duplicateRows,
    ]);
    setImages((current) => {
      const next = { ...current };
      duplicateRows.forEach((duplicate) => {
        next[duplicate.id] = sourceImages.map((image) => ({
          ...image,
          planned_task_id: duplicate.id,
        }));
      });
      return next;
    });
    setMultiDateConfigs((current) => {
      const next = { ...current };
      delete next[task.id];
      return next;
    });
    const hashtagWords = extractHashtagWords(task.title, task.note);
    await Promise.all(hashtagWords.map((word) => addDictionaryWord(word)));
    setSelectedDate(dates[0]);
    setDayTab("planned");
    setModalTaskId(null);
    setSavingId(null);
    setMessage(`Izveidotas ${dates.length} neatkarīgas kartītes.`);
  }

  async function sendTask(task: PlannedTask) {
    if (!task.title.trim() || !task.note.trim()) {
      setMessage("Nosaukums un piezīmes ir obligāti.");
      return;
    }
    if (task.id < 0) {
      setSavingId(task.id);
      const persistedTask = await persistTemporaryTask(task);
      setSavingId(null);
      if (persistedTask) await sendTask(persistedTask);
      return;
    }
    const multiDateConfig = multiDateConfigs[task.id];
    if (multiDateConfig?.enabled) {
      if (!task.title.trim() || !task.assignee_id) {
        const saved = await saveDraft(task);
        if (saved) {
          setModalTaskId(null);
          setInboxTab("planned");
          setExpandedTaskIds((current) => {
            const next = new Set(current);
            next.delete(task.id);
            return next;
          });
          setMessage("Kartīte saglabāta draftos.");
        }
        return;
      }
      await sendTaskToMultipleDates(task, multiDateConfig);
      return;
    }
    if (!isTaskReadyToPlan(task)) {
      const saved = await saveDraft(task);
      if (saved) {
        setModalTaskId(null);
        setInboxTab("planned");
        setExpandedTaskIds((current) => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        });
        setMessage("Kartīte saglabāta draftos.");
      }
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
      assignee_id: task.assignee_id,
      title: task.title.trim(),
      note: task.note.trim(),
      scheduled_date: task.scheduled_date,
      scheduled_time: task.scheduled_time,
      vehicle_id: task.vehicle_id,
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
    setModalTaskId(null);
    const hashtagWords = extractHashtagWords(task.title, task.note);
    await Promise.all(hashtagWords.map((word) => addDictionaryWord(word)));
    setSelectedDate(task.scheduled_date!);
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
    setExpandedTaskIds((current) => new Set(current).add(task.id));
  }

  async function deletePlannedTask(task: PlannedTask) {
    if (
      !window.confirm(
        `Vai neatgriezeniski dzēst uzdevumu “${task.title || "Bez nosaukuma"}”?`,
      )
    ) {
      return;
    }
    if (task.id < 0) {
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setModalTaskId(null);
      setExpandedTaskIds((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
      return;
    }
    setSavingId(task.id);
    const { data, error } = await supabase.rpc("delete_planned_task", {
      target_id: task.id,
    });
    setSavingId(null);
    if (error || data !== true) {
      setMessage("Uzdevumu neizdevās izdzēst.");
      return;
    }

    const paths = (images[task.id] || [])
      .map((image) => {
        const marker = "/task-images/";
        return image.url.includes(marker)
          ? decodeURIComponent(image.url.split(marker)[1])
          : "";
      })
      .filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from("task-images").remove(paths);
    }

    setTasks((current) => current.filter((item) => item.id !== task.id));
    setModalTaskId((current) => (current === task.id ? null : current));
    setImages((current) => {
      const next = { ...current };
      delete next[task.id];
      return next;
    });
    setMessage("Uzdevums izdzēsts.");
  }

  async function restorePlannedTask(task: PlannedTask) {
    setSavingId(task.id);
    setMessage("");
    const { data, error } = await supabase.rpc("restore_planned_task", {
      target_planned_task_id: task.id,
    });
    setSavingId(null);
    if (error || data !== true) {
      setMessage(
        "Uzdevumu neizdevās atjaunot. Iespējams, glabāšanas termiņš ir beidzies.",
      );
      return;
    }

    const { data: restoredTask } = await supabase
      .from("planned_tasks")
      .select("status")
      .eq("id", task.id)
      .single();
    const restoredStatus =
      (restoredTask?.status as PlannedStatus | undefined) || "started";
    changeLocalTask(task.id, { status: restoredStatus });
    setDayTab(restoredStatus === "completed" ? "completed" : "planned");
    setMessage("Uzdevums atjaunots.");
  }

  async function emptyTrash() {
    if (dayCounts.canceled === 0 || !selectedEmployeeId) return;
    if (
      !window.confirm(
        `Vai neatgriezeniski iztīrīt ${profileName(selectedEmployeeId)} miskasti ${shortDateLabel(selectedDate)}?`,
      )
    ) {
      return;
    }

    setMessage("");
    const { data, error } = await supabase.rpc("empty_planned_task_trash", {
      target_assignee_id: selectedEmployeeId,
      target_date: selectedDate,
    });
    if (error) {
      setMessage("Miskasti neizdevās iztīrīt.");
      return;
    }

    setTasks((current) =>
      current.filter(
        (task) =>
          !(
            task.assignee_id === selectedEmployeeId &&
            task.scheduled_date === selectedDate &&
            task.status === "canceled"
          ),
      ),
    );
    setMessage(`Neatgriezeniski izdzēsti ${Number(data) || 0} uzdevumi.`);
  }

  async function moveTask(task: PlannedTask, direction: -1 | 1) {
    const index = selectedDayTasks.findIndex((item) => item.id === task.id);
    const other = selectedDayTasks[index + direction];
    if (!other) return;

    const firstPosition = task.position;
    const secondPosition = other.position;
    const firstTime = task.scheduled_time;
    const secondTime = other.scheduled_time;
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, position: secondPosition, scheduled_time: secondTime }
          : item.id === other.id
            ? { ...item, position: firstPosition, scheduled_time: firstTime }
            : item,
      ),
    );

    const [{ error: firstError }, { error: secondError }] = await Promise.all([
      supabase
        .from("planned_tasks")
        .update({
          position: secondPosition,
          scheduled_time: secondTime,
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.id),
      supabase
        .from("planned_tasks")
        .update({
          position: firstPosition,
          scheduled_time: firstTime,
          updated_at: new Date().toISOString(),
        })
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
    const timeSlots = selectedDayTasks.map((task) => task.scheduled_time);
    const positions = new Map(
      reordered.map((task, index) => [task.id, index]),
    );
    const scheduledTimes = new Map(
      reordered.map((task, index) => [task.id, timeSlots[index]]),
    );

    setTasks((current) =>
      current.map((task) =>
        positions.has(task.id)
          ? {
              ...task,
              position: positions.get(task.id) as number,
              scheduled_time: scheduledTimes.get(task.id) || null,
            }
          : task,
      ),
    );
    setDraggedTaskId(null);

    const results = await Promise.all(
      reordered.map((task, index) =>
        supabase
          .from("planned_tasks")
          .update({
            position: index,
            scheduled_time: timeSlots[index],
            updated_at: new Date().toISOString(),
          })
          .eq("id", task.id),
      ),
    );
    if (results.some(({ error }) => error)) {
      setMessage("Uzdevumu secību neizdevās pilnībā saglabāt.");
    }
  }

  async function uploadImages(task: PlannedTask, files: FileList | null) {
    if (!files || files.length === 0 || !userId) return;
    if (task.id < 0) {
      setMessage("Foto var pievienot pēc kartītes saglabāšanas.");
      return;
    }
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
      {message && (
        <p className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl bg-blue-700 px-4 py-3 text-center text-sm font-semibold text-white shadow-xl">
          {message}
        </p>
      )}

      <div className="flex justify-end">
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

      <section className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleInbox}
            className="min-w-0 flex-1 text-left"
            aria-expanded={inboxExpanded}
          >
            <h2 className="font-semibold">Uzdevumi</h2>
          </button>
          <button
            type="button"
            onClick={toggleInbox}
            className="shrink-0 rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label={
              inboxExpanded
                ? "Aizvērt uzdevumus"
                : "Atvērt uzdevumus"
            }
            aria-expanded={inboxExpanded}
          >
            <ChevronDown
              size={20}
              className="transition-transform"
              style={{
                transform: inboxExpanded ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>
        </div>

        <div
              role="tablist"
              aria-label="Uzdevumu veidi"
              className="flex overflow-x-auto rounded-t-xl border border-b-0 border-zinc-300 bg-zinc-200 px-1 pt-1 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {(
                [
                  ["planned", `Plānotie ${inboxCounts.planned}`],
                  ["new", `Jauns ${inboxCounts.new}`],
                ] as [InboxTab, string][]
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={inboxTab === tab}
                  onClick={() => {
                    setInboxTab(tab);
                    setInboxExpanded(true);
                  }}
                  className={`relative min-w-32 flex-1 px-5 py-2.5 text-sm font-semibold transition-colors ${
                    inboxTab === tab
                      ? "z-10 rounded-t-xl bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white"
                      : "rounded-t-lg text-zinc-600 hover:bg-zinc-300/70 dark:text-zinc-400 dark:hover:bg-zinc-800/70"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

        {(inboxExpanded || modalTaskId !== null) && (
          <>
        {modalTaskId !== null && (
          <div className="fixed inset-0 z-40 bg-black/60" aria-hidden="true" />
        )}
        {displayedInboxTasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">
            Šajā tabā kartīšu nav.
          </p>
        ) : (
          displayedInboxTasks.map((task) => (
            <article
              key={task.id}
              id={`planned-task-${task.id}`}
              className={`rounded-xl border p-4 transition-colors ${
                modalTaskId === task.id
                  ? "fixed inset-x-4 bottom-4 top-4 z-50 mx-auto max-w-3xl overflow-y-auto bg-white shadow-2xl dark:bg-zinc-900"
                  : `relative ${
                      task.viewed_at
                        ? "border-zinc-200 dark:border-zinc-700"
                        : "border-amber-400 bg-amber-50 ring-2 ring-amber-300/60 dark:border-amber-500 dark:bg-amber-950/30"
                    }`
              }`}
            >
              <div className="flex items-center gap-2">
                {!expandedTaskIds.has(task.id) ? (
                  <button
                    type="button"
                    onClick={() => toggleTask(task)}
                    className="min-w-0 flex-1 text-left"
                    aria-expanded={false}
                  >
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">
                        {task.title.trim() || "Bez nosaukuma"}
                      </h3>
                      <p className="mt-1 truncate text-sm text-zinc-500">
                        {notePreview(task.note)}
                      </p>
                    </div>
                  </button>
                ) : (
                  <div className="min-w-0 flex-1" />
                )}
                <button
                  type="button"
                  onClick={() => toggleTask(task)}
                  className="shrink-0 rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  aria-label={
                    expandedTaskIds.has(task.id)
                      ? "Aizvērt kartīti"
                      : "Atvērt kartīti"
                  }
                  aria-expanded={expandedTaskIds.has(task.id)}
                >
                  <ChevronDown
                    size={20}
                    className="transition-transform"
                    style={{
                      transform: expandedTaskIds.has(task.id)
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                    }}
                  />
                </button>
              </div>
              {expandedTaskIds.has(task.id) && (
                <div className="mt-4 space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
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
                    value={task.assignee_id ?? ""}
                    onChange={(event) => {
                      const assigneeId = event.target.value || null;
                      changeLocalTask(task.id, {
                        assignee_id: assigneeId,
                      });
                    }}
                    className="w-full rounded-lg border border-zinc-300 bg-white p-2 text-zinc-950 [color-scheme:light] dark:border-zinc-600 dark:bg-zinc-900 dark:text-white dark:[color-scheme:dark]"
                  >
                    <option value="">Nav piešķirts</option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.display_name || profile.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Auto VNZ</span>
                  <div>
                    <select
                      value={task.vehicle_id ?? ""}
                      onChange={(event) => {
                        const vehicleId = event.target.value
                          ? Number(event.target.value)
                          : null;
                        changeLocalTask(task.id, { vehicle_id: vehicleId });
                      }}
                      className="w-full min-w-0 rounded-lg border border-zinc-300 bg-white p-2 text-zinc-950 [color-scheme:light] dark:border-zinc-600 dark:bg-zinc-900 dark:text-white dark:[color-scheme:dark]"
                    >
                      <option
                        value=""
                        className="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white"
                      >
                        Nav izvēlēts
                      </option>
                      {vehicles.map((vehicle) => (
                        <option
                          key={vehicle.id}
                          value={vehicle.id}
                          className="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white"
                        >
                          {vehicle.registration_number}
                          {vehicle.display_name
                            ? ` · ${vehicle.display_name}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
                <div className="flex items-center gap-2 self-end">
                  <div className="relative min-w-0 flex-1">
                    <div
                      className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                    >
                      <CalendarClock size={19} className="shrink-0 text-blue-600" />
                      <span className="truncate font-medium">
                        {scheduledDateTimeLabel(task)}
                      </span>
                    </div>
                    <input
                      type="datetime-local"
                      required
                      value={`${task.scheduled_date || selectedDate}T${task.scheduled_time?.slice(0, 5) || nextTimeForDate(task.scheduled_date || selectedDate, task.id)}`}
                      onClick={(event) => {
                        try {
                          event.currentTarget.showPicker();
                        } catch {
                          // Safari izmanto paša lietotāja pieskārienu sistēmas izvēlnei.
                        }
                      }}
                      onChange={(event) =>
                        changeSchedule(task, event.currentTarget.value)
                      }
                      aria-label="Izvēlēties uzdevuma datumu un laiku"
                      className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                    />
                  </div>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 px-2 py-2 text-xs font-medium dark:border-zinc-600">
                    <input
                      type="checkbox"
                      checked={multiDateConfigs[task.id]?.enabled || false}
                      onChange={(event) =>
                        updateMultiDateConfig(task, {
                          enabled: event.target.checked,
                        })
                      }
                      className="h-4 w-4 accent-blue-600"
                    />
                    <span>Vairāki datumi</span>
                  </label>
                </div>
              </div>

              {multiDateConfigs[task.id]?.enabled && (() => {
                const config = multiDateConfigs[task.id];
                const dates = selectedDates(config);
                const weekdayLabels = [
                  [1, "P"],
                  [2, "O"],
                  [3, "T"],
                  [4, "C"],
                  [5, "Pk"],
                ] as const;
                return (
                  <div className="space-y-3 rounded-xl border border-blue-300 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/20">
                    <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                      {([
                        ["manual", "Atsevišķi"],
                        ["range", "Periods"],
                        ["month", "Mēnesis"],
                      ] as const).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => updateMultiDateConfig(task, { mode })}
                          className={`px-2 py-2 text-sm font-medium ${
                            config.mode === mode
                              ? "bg-blue-600 text-white"
                              : "bg-white hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {config.mode === "manual" && (
                      <div className="space-y-2">
                        <div className="overflow-hidden rounded-xl border border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                          <div className="mb-3 flex items-center justify-between">
                          <button
                            type="button"
                              onClick={() =>
                                updateMultiDateConfig(task, {
                                  manualMonth: adjacentMonth(
                                    config.manualMonth,
                                    -1,
                                  ),
                                })
                              }
                              className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              aria-label="Iepriekšējais mēnesis"
                            >
                              <ChevronLeft size={20} />
                            </button>
                            <strong className="capitalize">
                              {monthLabel(config.manualMonth)}
                            </strong>
                            <button
                              type="button"
                              onClick={() =>
                                updateMultiDateConfig(task, {
                                  manualMonth: adjacentMonth(
                                    config.manualMonth,
                                    1,
                                  ),
                                })
                              }
                              className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              aria-label="Nākamais mēnesis"
                            >
                              <ChevronRight size={20} />
                            </button>
                          </div>
                          <div className="mb-1 grid grid-cols-7 text-center text-xs font-semibold text-zinc-500">
                            {['P', 'O', 'T', 'C', 'Pk', 'S', 'Sv'].map((day) => (
                              <span key={day} className="py-1">{day}</span>
                            ))}
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {calendarDays(config.manualMonth).map((date, index) => {
                              if (!date) return <span key={`empty-${index}`} />;
                              const selected = config.manualDates.includes(date);
                              return (
                                <button
                                  key={date}
                                  type="button"
                                  onClick={() =>
                                    updateMultiDateConfig(task, {
                                      manualDates: selected
                                        ? config.manualDates.filter(
                                            (item) => item !== date,
                                          )
                                        : [...config.manualDates, date].sort(),
                                    })
                                  }
                                  className={`aspect-square rounded-lg text-sm font-medium transition ${
                                    selected
                                      ? "bg-blue-600 text-white shadow-sm"
                                      : "hover:bg-blue-100 dark:hover:bg-blue-950"
                                  }`}
                                  aria-pressed={selected}
                                  aria-label={shortDateLabel(date)}
                                >
                                  {Number(date.slice(-2))}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <p className="text-xs text-zinc-500">
                          Uzspied datumam, lai to atzīmētu vai noņemtu. Šeit var
                          izvēlēties arī sestdienas un svētdienas.
                        </p>
                      </div>
                    )}

                    {config.mode === "range" && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="space-y-1 text-xs font-medium">
                          <span>No</span>
                          <input
                            type="date"
                            value={config.from}
                            onChange={(event) =>
                              updateMultiDateConfig(task, { from: event.target.value })
                            }
                            className="w-full rounded-lg border border-zinc-300 bg-white p-2 dark:border-zinc-600 dark:bg-zinc-900"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-medium">
                          <span>Līdz</span>
                          <input
                            type="date"
                            value={config.to}
                            onChange={(event) =>
                              updateMultiDateConfig(task, { to: event.target.value })
                            }
                            className="w-full rounded-lg border border-zinc-300 bg-white p-2 dark:border-zinc-600 dark:bg-zinc-900"
                          />
                        </label>
                      </div>
                    )}

                    {config.mode === "month" && (
                      <label className="block space-y-1 text-xs font-medium">
                        <span>Mēnesis</span>
                        <input
                          type="month"
                          value={config.month}
                          onChange={(event) =>
                            updateMultiDateConfig(task, { month: event.target.value })
                          }
                          className="w-full rounded-lg border border-zinc-300 bg-white p-2 dark:border-zinc-600 dark:bg-zinc-900"
                        />
                      </label>
                    )}

                    {config.mode !== "manual" && (
                      <div className="space-y-1">
                        <span className="text-xs font-medium">Darba dienas</span>
                        <div className="flex gap-2">
                          {weekdayLabels.map(([weekday, label]) => (
                            <button
                              key={weekday}
                              type="button"
                              onClick={() =>
                                updateMultiDateConfig(task, {
                                  weekdays: config.weekdays.includes(weekday)
                                    ? config.weekdays.filter((day) => day !== weekday)
                                    : [...config.weekdays, weekday].sort(),
                                })
                              }
                              className={`min-w-10 rounded-lg border px-2 py-2 text-sm font-semibold ${
                                config.weekdays.includes(weekday)
                                  ? "border-blue-600 bg-blue-600 text-white"
                                  : "border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-zinc-500">
                          Sestdienas un svētdienas šajā režīmā netiek iekļautas.
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {dates.slice(0, 14).map((date) => (
                        <span
                          key={date}
                          className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs font-medium shadow-sm dark:bg-zinc-900"
                        >
                          {shortDateLabel(date)}
                          {config.mode === "manual" && (
                            <button
                              type="button"
                              onClick={() =>
                                updateMultiDateConfig(task, {
                                  manualDates: config.manualDates.filter(
                                    (item) => item !== date,
                                  ),
                                })
                              }
                              aria-label={`Noņemt ${shortDateLabel(date)}`}
                            >
                              <X size={13} />
                            </button>
                          )}
                        </span>
                      ))}
                      {dates.length > 14 && (
                        <span className="rounded-full px-2 py-1 text-xs font-medium">
                          +{dates.length - 14}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold">
                      Tiks izveidotas {dates.length} neatkarīgas kartītes.
                    </p>
                  </div>
                );
              })()}

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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={savingId === task.id}
                    onClick={() => void deletePlannedTask(task)}
                    className="flex items-center justify-center rounded-lg bg-red-600 p-2.5 text-white hover:bg-red-700 disabled:opacity-50"
                    aria-label="Dzēst kartīti"
                    title="Dzēst kartīti"
                  >
                    <Trash2 size={18} />
                  </button>
                  <button
                    type="button"
                    disabled={savingId === task.id}
                    onClick={() => void sendTask(task)}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Send size={18} />
                    {savingId === task.id ? "Saglabā..." : "Nosūtīt"}
                  </button>
                </div>
              </div>
                </div>
              )}
            </article>
          ))
        )}
          </>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDayPlanExpanded((current) => !current)}
            className="min-w-0 flex-1 text-left"
            aria-expanded={dayPlanExpanded}
          >
            <div>
              <h2 className="font-semibold">Dienas plāns</h2>
              {dayPlanExpanded && (
                <p className="text-sm text-zinc-500">
                  Izvēlies datumu un sakārto secību.
                </p>
              )}
            </div>
          </button>
          {dayPlanExpanded && (
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="min-w-0 max-w-44 rounded-lg border border-zinc-300 bg-transparent p-2 dark:border-zinc-600"
            />
          )}
          <button
            type="button"
            onClick={() => setDayPlanExpanded((current) => !current)}
            className="shrink-0 rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label={dayPlanExpanded ? "Aizvērt dienas plānu" : "Atvērt dienas plānu"}
            aria-expanded={dayPlanExpanded}
          >
            <ChevronDown
              size={20}
              className="transition-transform"
              style={{
                transform: dayPlanExpanded ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>
        </div>

        {dayPlanExpanded && (
          <>
        <div
          role="tablist"
          aria-label="Darbinieki"
          className="flex overflow-x-auto rounded-t-xl border border-b-0 border-zinc-300 bg-zinc-200 px-1 pt-1 dark:border-zinc-700 dark:bg-zinc-950"
        >
          {employeeProfiles.map((profile, index) => (
            <button
              key={profile.id}
              type="button"
              role="tab"
              aria-selected={selectedEmployeeId === profile.id}
              onClick={() => setSelectedEmployeeId(profile.id)}
              className={`relative min-w-32 shrink-0 px-5 py-2.5 text-sm font-semibold transition-colors ${
                selectedEmployeeId === profile.id
                  ? "z-10 rounded-t-xl bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white"
                  : `rounded-t-lg text-zinc-600 hover:bg-zinc-300/70 dark:text-zinc-400 dark:hover:bg-zinc-800/70 ${
                      index > 0
                        ? "before:absolute before:bottom-2 before:left-0 before:top-2 before:w-px before:bg-zinc-400/60 dark:before:bg-zinc-600"
                        : ""
                    }`
              }`}
            >
              {profile.display_name || profile.email}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          {(
            [
              ["planned", `Plānotie ${dayCounts.planned}`],
              ["completed", `Izpildītie ${dayCounts.completed}`],
              ["canceled", `Miskaste ${dayCounts.canceled}`],
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

        {dayTab === "canceled" && dayCounts.canceled > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void emptyTrash()}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Iztīrīt miskasti
            </button>
          </div>
        )}

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
                      onClick={() => deletePlannedTask(task)}
                      disabled={savingId === task.id}
                      className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:text-red-300"
                    >
                      {savingId === task.id ? "Dzēš..." : "Dzēst"}
                    </button>
                  </div>
                )}
                {task.status === "canceled" && task.task_log_id && (
                  <div className="mt-3 flex justify-end border-t border-zinc-200 pt-3 dark:border-zinc-700">
                    <button
                      type="button"
                      onClick={() => void restorePlannedTask(task)}
                      disabled={savingId === task.id}
                      className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {savingId === task.id ? "Atjauno..." : "Atjaunot"}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
          </>
        )}
      </section>
      <TransportRequestModal
        requestId={openedRequestId}
        onClose={() => setOpenedRequestId(null)}
        editable
        onSaved={() => window.location.reload()}
      />
    </div>
  );
}
