"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/lib/supabaseClient";
import { calculateWorkHours } from "./utils";
import ImageGalleryModal from "@/app/components/ImageGalleryModal";
import TaskPreviewCard from "@/app/components/TaskPreviewCard";
import TaskDetailsCard from "@/app/components/TaskDetailsCard";

type DayModalProps = {
  date: string;
  ownerId: string;
  showWorkTime: boolean;
  isAdmin: boolean;
  onWorkTimeChanged: () => void | Promise<void>;
  onClose: () => void;
};

type WorkLog = {
  id: number;
  start_time: string;
  end_time: string | null;
};

type WorkLogCorrection = {
  id: number;
  action: "created" | "updated";
  previous_start_time: string | null;
  previous_end_time: string | null;
  new_start_time: string;
  new_end_time: string;
  created_at: string;
};

type Task = {
  id: number;
  title: string | null;
  note: string | null;
  start_time: string;
  end_time: string | null;
  session_id?: string | null;
};

type TaskImageRow = {
  url: string;
  task_log_id: number;
};

type PlannedTask = {
  id: number;
  title: string;
  note: string;
  scheduled_time: string | null;
  status: "new" | "planned" | "started" | "completed" | "canceled";
  position: number;
};

type TaskTimerRow = {
  id: string;
  task_log_id: number;
  label: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
};

type TaskTimelineRow = {
  id: string;
  task_log_id: number;
  label: string;
  created_at: string;
};

type SelectedTask = {
  id: number;
  title: string;
  notes: string | null;
  timeRangeText: string;
  timers: { id: string; label: string; durationText: string }[];
  timeline: { id: string; label: string; timeText: string; durationFromPrevious?: string }[];
  imageUrls: string[];
  badgeText?: string;
};

function formatHours(hours: number) {
  const totalMin = Math.round((hours || 0) * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh}h ${mm}m`;
}

function formatDurationFromSeconds(totalSeconds: number) {
  const totalMin = Math.floor(totalSeconds / 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh}h ${mm}m`;
}

function buildTimeRangeText(start: string, end: string | null) {
  if (!end) return "Nav pilna laika informācija";

  const startDate = new Date(start);
  const endDate = new Date(end);

  const diffMs = endDate.getTime() - startDate.getTime();
  const totalMin = Math.floor(diffMs / 60000);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  const durationText = `${hh}h ${mm}min`;

  return `${format(startDate, "HH:mm")}-${format(endDate, "HH:mm")} (${durationText})`;
}

function toDateTimeLocalValue(value: string | Date) {
  const dateValue = value instanceof Date ? value : new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${dateValue.getFullYear()}-${pad(dateValue.getMonth() + 1)}-${pad(
    dateValue.getDate(),
  )}T${pad(dateValue.getHours())}:${pad(dateValue.getMinutes())}`;
}

export default function DayModal({
  date,
  ownerId,
  showWorkTime,
  isAdmin,
  onWorkTimeChanged,
  onClose,
}: DayModalProps) {
  const [workLog, setWorkLog] = useState<WorkLog | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [imagesByTask, setImagesByTask] = useState<Record<number, string[]>>(
    {},
  );
  const [timersByTask, setTimersByTask] = useState<
    Record<number, TaskTimerRow[]>
  >({});
  const [timelineByTask, setTimelineByTask] = useState<
    Record<number, TaskTimelineRow[]>
  >({});
  const [selectedImages, setSelectedImages] = useState<string[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedTask, setSelectedTask] = useState<SelectedTask | null>(null);
  const [plannedTasks, setPlannedTasks] = useState<PlannedTask[]>([]);
  const [plannedImages, setPlannedImages] = useState<Record<number, string[]>>(
    {},
  );
  const [hours, setHours] = useState({
    baseHours: 0,
    overtimeHours: 0,
  });
  const [editingWorkTime, setEditingWorkTime] = useState(false);
  const [workStart, setWorkStart] = useState("");
  const [workEnd, setWorkEnd] = useState("");
  const [savingWorkTime, setSavingWorkTime] = useState(false);
  const [workTimeError, setWorkTimeError] = useState("");
  const [corrections, setCorrections] = useState<WorkLogCorrection[]>([]);

  useEffect(() => {
    loadData();
  }, [date, ownerId]);

  async function loadData() {
    setLoading(true);

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const from = start.toISOString();
    const to = end.toISOString();

    const { data: workLogs, error: workError } = await supabase
      .from("work_logs")
      .select("id, start_time, end_time")
      .eq("user_id", ownerId)
      .gte("start_time", from)
      .lte("start_time", to)
      .order("start_time", { ascending: true });

    const { data: taskLogs, error: taskError } = await supabase
      .from("task_logs")
      .select("*")
      .eq("user_id", ownerId)
      .gte("start_time", from)
      .lte("start_time", to)
      .order("start_time", { ascending: true });

    const { data: plannedRows, error: plannedError } = await supabase
      .from("planned_tasks")
      .select("id, title, note, scheduled_time, status, position")
      .eq("assignee_id", ownerId)
      .eq("scheduled_date", date)
      .in("status", ["planned", "started"])
      .order("position", { ascending: true });

    if (workError || taskError || plannedError) {
      console.error("Day modal load error:", {
        workError,
        taskError,
        plannedError,
      });
      setWorkLog(null);
      setTasks([]);
      setImagesByTask({});
      setTimersByTask({});
      setPlannedTasks([]);
      setPlannedImages({});
      setHours({ baseHours: 0, overtimeHours: 0 })
      setLoading(false);
      return;
    }

    const work = ((workLogs || []) as WorkLog[])[0] || null;
    const taskRows = (taskLogs || []) as Task[];

    setWorkLog(work);
    if (work) {
      setWorkStart(toDateTimeLocalValue(work.start_time));
      setWorkEnd(
        work.end_time
          ? toDateTimeLocalValue(work.end_time)
          : toDateTimeLocalValue(new Date()),
      );
    } else {
      setWorkStart(`${date}T08:00`);
      setWorkEnd(`${date}T17:00`);
    }
    setTasks(taskRows);
    setPlannedTasks((plannedRows || []) as PlannedTask[]);

    const plannedIds = (plannedRows || []).map((task) => task.id);
    if (plannedIds.length > 0) {
      const { data: plannedImageRows } = await supabase
        .from("planned_task_images")
        .select("planned_task_id, url")
        .in("planned_task_id", plannedIds);
      const grouped: Record<number, string[]> = {};
      (plannedImageRows || []).forEach((image) => {
        if (!grouped[image.planned_task_id]) {
          grouped[image.planned_task_id] = [];
        }
        grouped[image.planned_task_id].push(image.url);
      });
      setPlannedImages(grouped);
    } else {
      setPlannedImages({});
    }

    if (taskRows.length > 0) {
      const taskIds = taskRows.map((t) => t.id);

      const [
        { data: imageData, error: imageError },
        { data: timerData, error: timerError },
        { data: timelineData, error: timelineError },
      ] = await Promise.all([
        supabase
          .from("task_images")
          .select("url, task_log_id")
          .in("task_log_id", taskIds),
        supabase
          .from("task_timers")
          .select(
            "id, task_log_id, label, started_at, ended_at, duration_seconds",
          )
          .in("task_log_id", taskIds)
          .order("started_at", { ascending: true }),
        supabase
          .from("task_timeline_events")
          .select("id, task_log_id, label, created_at")
          .in("task_log_id", taskIds)
          .order("created_at", { ascending: true }),
      ]);

      if (imageError) {
        console.error("Task images load error:", imageError);
        setImagesByTask({});
      } else {
        const groupedImages: Record<number, string[]> = {};

        ((imageData || []) as TaskImageRow[]).forEach((img) => {
          if (!groupedImages[img.task_log_id])
            groupedImages[img.task_log_id] = [];
          groupedImages[img.task_log_id].push(img.url);
        });

        setImagesByTask(groupedImages);
      }

      if (timerError) {
        console.error("Task timers load error:", timerError);
        setTimersByTask({});
      } else {
        const groupedTimers: Record<number, TaskTimerRow[]> = {};

        ((timerData || []) as TaskTimerRow[]).forEach((timer) => {
          if (!groupedTimers[timer.task_log_id])
            groupedTimers[timer.task_log_id] = [];
          groupedTimers[timer.task_log_id].push(timer);
        });

        setTimersByTask(groupedTimers);
      }

      if (timelineError) {
        console.error("Task timeline load error:", timelineError);
        setTimelineByTask({});
      } else {
        const groupedTimeline: Record<number, TaskTimelineRow[]> = {};
        ((timelineData || []) as TaskTimelineRow[]).forEach((entry) => {
          if (!groupedTimeline[entry.task_log_id]) groupedTimeline[entry.task_log_id] = [];
          groupedTimeline[entry.task_log_id].push(entry);
        });
        setTimelineByTask(groupedTimeline);
      }
    } else {
      setImagesByTask({});
      setTimersByTask({});
      setTimelineByTask({});
    }

    const { baseHours, overtimeHours } = work?.end_time
      ? calculateWorkHours(new Date(work.start_time), new Date(work.end_time))
      : { baseHours: 0, overtimeHours: 0 };

    setHours({ baseHours, overtimeHours });
    if (isAdmin) await loadCorrections();
    setLoading(false);
  }

  async function loadCorrections() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;

    const response = await fetch(
      `/api/admin/work-time?ownerId=${encodeURIComponent(ownerId)}&date=${encodeURIComponent(date)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) return;
    const payload = (await response.json()) as {
      corrections?: WorkLogCorrection[];
    };
    setCorrections(payload.corrections || []);
  }

  async function saveWorkTime(confirmTaskConflict = false) {
    setWorkTimeError("");
    if (!workStart || !workEnd) {
      setWorkTimeError("Aizpildi sākuma un beigu laiku.");
      return;
    }

    const start = new Date(workStart);
    const end = new Date(workEnd);
    if (end <= start) {
      setWorkTimeError("Beigu laikam jābūt pēc sākuma laika.");
      return;
    }

    setSavingWorkTime(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setWorkTimeError("Nederīga sesija.");
        return;
      }

      const response = await fetch("/api/admin/work-time", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerId,
          date,
          workLogId: workLog?.id || null,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          confirmTaskConflict,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        requiresConfirmation?: boolean;
      };

      if (!response.ok) {
        if (
          payload.requiresConfirmation &&
          window.confirm(
            `${payload.error || "Daļa uzdevumu neiekļaujas darba laikā."}\n\nVai tomēr saglabāt darba laiku?`,
          )
        ) {
          await saveWorkTime(true);
          return;
        }
        setWorkTimeError(payload.error || "Darba laiku neizdevās saglabāt.");
        return;
      }

      setEditingWorkTime(false);
      await loadData();
      await onWorkTimeChanged();
    } finally {
      setSavingWorkTime(false);
    }
  }

  const closeImageModal = () => {
    setSelectedImages(null);
    setSelectedIndex(0);
  };

  const openTaskGallery = (taskId: number, index: number) => {
    const taskImages = imagesByTask[taskId];
    if (!taskImages || taskImages.length === 0) return;
    setSelectedImages(taskImages);
    setSelectedIndex(index);
  };

  const openTaskDetails = (task: Task) => {
    const timers = (timersByTask[task.id] || []).map((timer) => ({
      id: timer.id,
      label: timer.label,
      durationText:
        timer.duration_seconds !== null
          ? formatDurationFromSeconds(timer.duration_seconds)
          : "Aktīvs taimeris",
    }));

    const formatGap = (from: Date, to: Date) => {
      const totalSeconds = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      if (hours > 0) return `${hours}h ${minutes}min`;
      return `${minutes}min`;
    };
    const timelinePoints = [
      { id: "task-start", label: "Uzdevums sākts", at: new Date(task.start_time) },
      ...(timelineByTask[task.id] || []).map((entry) => ({
        id: entry.id,
        label: entry.label,
        at: new Date(entry.created_at),
      })),
      ...(task.end_time ? [{ id: "task-end", label: "Uzdevums pabeigts", at: new Date(task.end_time) }] : []),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());

    const timeline = timelinePoints.map((entry, index) => ({
      id: entry.id,
      label: entry.label,
      timeText: format(entry.at, "HH:mm:ss"),
      durationFromPrevious: index > 0 ? formatGap(timelinePoints[index - 1].at, entry.at) : undefined,
    }));

    setSelectedTask({
      id: task.id,
      title: task.title || "Bez nosaukuma",
      notes: task.note,
      timeRangeText: buildTimeRangeText(task.start_time, task.end_time),
      timers,
      timeline,
      imageUrls: imagesByTask[task.id] || [],
      badgeText: undefined,
    });
  };

  const previewCards = useMemo(() => {
    return tasks.map((task) => ({
      id: task.id,
      title: task.title || "Bez nosaukuma",
      timeRangeText: buildTimeRangeText(task.start_time, task.end_time),
      imageUrls: imagesByTask[task.id] || [],
      badgeText: undefined,
      raw: task,
    }));
  }, [tasks, imagesByTask]);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-300 bg-white text-zinc-900 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950 dark:text-white">
          <div className="flex items-center justify-between border-b border-zinc-300 bg-white px-5 py-4 dark:border-zinc-700 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold">
              {format(parseISO(date), "yyyy-MM-dd")}
            </h2>

            <button
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 hover:bg-zinc-100 dark:border-zinc-600 dark:text-white dark:hover:bg-zinc-800"
            >
              Aizvērt
            </button>
          </div>

          <div className="overflow-y-auto bg-white px-5 py-4 dark:bg-zinc-950">
            {loading ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Ielādē...
              </p>
            ) : (
              <div className="space-y-5">
                {showWorkTime && (
                  <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="font-medium">Darba laiks:</span>{" "}
                        {workLog
                          ? `${format(new Date(workLog.start_time), "HH:mm")} – ${
                              workLog.end_time
                                ? format(new Date(workLog.end_time), "HH:mm")
                                : "Nav noslēgta"
                            }`
                          : "Nav datu"}
                      </p>

                      <p>
                        <span className="font-medium">Pamata:</span>{" "}
                        {formatHours(hours.baseHours)}
                        {" • "}
                        <span className="font-medium">Virsstundas:</span>{" "}
                        {formatHours(hours.overtimeHours)}
                      </p>

                      {isAdmin && !editingWorkTime && (
                        <button
                          type="button"
                          onClick={() => {
                            setWorkTimeError("");
                            setEditingWorkTime(true);
                          }}
                          className="mt-2 rounded-lg bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-700"
                        >
                          {workLog ? "Labot laikus" : "Izveidot darba dienu"}
                        </button>
                      )}
                    </div>

                    {isAdmin && editingWorkTime && (
                      <div className="mt-4 space-y-3 border-t border-zinc-300 pt-4 dark:border-zinc-700">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="space-y-1 text-sm font-medium">
                            <span>Sākuma datums un laiks</span>
                            <input
                              type="datetime-local"
                              value={workStart}
                              onChange={(event) => setWorkStart(event.target.value)}
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-white"
                            />
                          </label>
                          <label className="space-y-1 text-sm font-medium">
                            <span>Beigu datums un laiks</span>
                            <input
                              type="datetime-local"
                              value={workEnd}
                              onChange={(event) => setWorkEnd(event.target.value)}
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-white"
                            />
                          </label>
                        </div>
                        {workTimeError && (
                          <p className="text-sm font-medium text-red-600 dark:text-red-400">
                            {workTimeError}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={savingWorkTime}
                            onClick={() => saveWorkTime()}
                            className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                          >
                            {savingWorkTime ? "Saglabā..." : "Saglabāt"}
                          </button>
                          <button
                            type="button"
                            disabled={savingWorkTime}
                            onClick={() => setEditingWorkTime(false)}
                            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium dark:border-zinc-600"
                          >
                            Atcelt
                          </button>
                        </div>
                      </div>
                    )}

                    {isAdmin && corrections.length > 0 && (
                      <details className="mt-4 border-t border-zinc-300 pt-3 text-sm dark:border-zinc-700">
                        <summary className="cursor-pointer font-medium">
                          Labojumu vēsture ({corrections.length})
                        </summary>
                        <div className="mt-3 space-y-2">
                          {corrections.map((correction) => (
                            <div
                              key={correction.id}
                              className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950"
                            >
                              <p className="font-medium">
                                {correction.action === "created"
                                  ? "Darba diena izveidota"
                                  : "Darba laiks labots"}
                              </p>
                              <p className="text-zinc-600 dark:text-zinc-300">
                                {format(new Date(correction.new_start_time), "yyyy-MM-dd HH:mm")} –{" "}
                                {format(new Date(correction.new_end_time), "yyyy-MM-dd HH:mm")}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {format(new Date(correction.created_at), "yyyy-MM-dd HH:mm")}
                              </p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {plannedTasks.length > 0 && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
                    <h3 className="mb-3 text-base font-semibold">
                      Plānotie uzdevumi
                    </h3>
                    <div className="space-y-2">
                        {plannedTasks.map((task, index) => (
                          <div
                            key={task.id}
                            className="rounded-lg border border-blue-200 bg-white p-3 dark:border-blue-900 dark:bg-zinc-900"
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-sm font-semibold text-blue-600">
                                {index + 1}.
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="font-semibold">{task.title}</h4>
                                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
                                    {task.status === "started"
                                      ? "Sākts"
                                      : task.status === "completed"
                                        ? "Pabeigts"
                                        : "Plānots"}
                                  </span>
                                </div>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">
                                  {task.note}
                                </p>
                                {task.scheduled_time && (
                                  <p className="mt-1 text-xs text-zinc-500">
                                    Laiks: {task.scheduled_time.slice(0, 5)}
                                  </p>
                                )}
                                {(plannedImages[task.id] || []).length > 0 && (
                                  <div className="mt-2 flex gap-2 overflow-x-auto">
                                    {(plannedImages[task.id] || []).map(
                                      (url, imageIndex) => (
                                        <button
                                          key={url}
                                          type="button"
                                          onClick={() => {
                                            setSelectedImages(
                                              plannedImages[task.id],
                                            );
                                            setSelectedIndex(imageIndex);
                                          }}
                                        >
                                          <Image
                                            src={url}
                                            alt=""
                                            width={56}
                                            height={56}
                                            unoptimized
                                            className="h-14 w-14 rounded object-cover"
                                          />
                                        </button>
                                      ),
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                <div className="rounded-xl bg-white dark:bg-zinc-950">
                  <h3 className="mb-3 text-base font-semibold">Uzdevumi</h3>

                  {previewCards.length === 0 ? (
                    <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      Nav uzdevumu
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {previewCards.map((task) => (
                        <TaskPreviewCard
                          key={task.id}
                          title={task.title}
                          timeRangeText={task.timeRangeText}
                          imageUrls={task.imageUrls}
                          onOpenImage={(index) =>
                            openTaskGallery(task.id, index)
                          }
                          onOpenDetails={() => openTaskDetails(task.raw)}
                          badgeText={task.badgeText}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedTask && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl">
            <TaskDetailsCard
              title={selectedTask.title}
              notes={selectedTask.notes}
              timeRangeText={selectedTask.timeRangeText}
              timers={selectedTask.timers}
              timeline={selectedTask.timeline}
              imageUrls={selectedTask.imageUrls}
              onOpenImage={(index) => openTaskGallery(selectedTask.id, index)}
              onClose={() => setSelectedTask(null)}
              badgeText={selectedTask.badgeText}
            />
          </div>
        </div>
      )}

      <ImageGalleryModal
        images={selectedImages}
        selectedIndex={selectedIndex}
        setSelectedIndex={setSelectedIndex}
        onClose={closeImageModal}
      />
    </>
  );
}
