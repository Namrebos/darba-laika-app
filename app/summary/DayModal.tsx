"use client";

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
  canDelete: boolean;
  onClose: () => void;
  onDeleted: () => void;
};

type WorkLog = {
  id: number;
  start_time: string;
  end_time: string;
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

export default function DayModal({ date, ownerId, canDelete, onClose, onDeleted }: DayModalProps) {
  const [workLog, setWorkLog] = useState<WorkLog | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
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
  const [hours, setHours] = useState({
    baseHours: 0,
    overtimeHours: 0,
  });

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
      .select("*")
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

    if (workError || taskError) {
      console.error("Day modal load error:", { workError, taskError });
      setWorkLog(null);
      setTasks([]);
      setImagesByTask({});
      setTimersByTask({});
      setHours({ baseHours: 0, overtimeHours: 0 })
      setLoading(false);
      return;
    }

    const work = ((workLogs || []) as WorkLog[])[0] || null;
    const taskRows = (taskLogs || []) as Task[];

    setWorkLog(work);
    setTasks(taskRows);

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

    const { baseHours, overtimeHours } = work
      ? calculateWorkHours(new Date(work.start_time), new Date(work.end_time))
      : { baseHours: 0, overtimeHours: 0 };

    setHours({ baseHours, overtimeHours });
    setLoading(false);
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

  const deleteWorkLog = async () => {
    if (!workLog || !window.confirm("Vai tiešām dzēst šo darba dienu un visus tās uzdevumus un attēlus?")) return;

    setDeleting(true);
    setDeleteError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch(`/api/work-logs/${workLog.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
      },
    });
    const result = (await response.json()) as { error?: string };
    setDeleting(false);

    if (!response.ok) {
      setDeleteError(result.error || "Darba dienu neizdevās izdzēst.");
      return;
    }

    onDeleted();
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

            <div className="flex gap-2">
              {canDelete && workLog && (
                <button
                  onClick={deleteWorkLog}
                  disabled={deleting}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                >
                  {deleting ? "Dzēš..." : "Dzēst dienu"}
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 hover:bg-zinc-100 dark:border-zinc-600 dark:text-white dark:hover:bg-zinc-800"
              >
                Aizvērt
              </button>
            </div>
          </div>

          <div className="overflow-y-auto bg-white px-5 py-4 dark:bg-zinc-950">
            {deleteError && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{deleteError}</p>}
            {loading ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Ielādē...
              </p>
            ) : (
              <div className="space-y-5">
                <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="font-medium">Darba laiks:</span>{" "}
                      {workLog
                        ? `${format(new Date(workLog.start_time), "HH:mm")} – ${format(
                            new Date(workLog.end_time),
                            "HH:mm",
                          )}`
                        : "Nav datu"}
                    </p>

                    <p>
                      <span className="font-medium">Pamata:</span>{" "}
                      {formatHours(hours.baseHours)}
                      {" • "}
                      <span className="font-medium">Virsstundas:</span>{" "}
                      {formatHours(hours.overtimeHours)}
                    </p>
                  </div>
                </div>

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
