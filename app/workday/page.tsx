"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { addPhotoTimestamp } from "@/lib/addPhotoTimestamp";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import Image from "next/image";
import TaskCard from "../components/TaskCard";
import TransportRequestModal from "@/app/components/TransportRequestModal";
import { ExternalLink } from "lucide-react";

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
  plannedTaskId?: number;
  transportRequestId?: number;
};

type PlannedTask = {
  id: number;
  title: string;
  note: string;
  scheduled_time: string | null;
  position: number;
  imageUrls: string[];
  transport_request_id: number | null;
};

type DictionaryWord = {
  name: string;
  usageCount: number;
};

type DeletedTask = {
  id: number;
  title: string;
  note: string | null;
  deleted_at: string;
};

function makeLocalId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function WorkdayPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [workdayState, setWorkdayState] = useState<"inactive" | "active">(
    "inactive",
  );
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dictionaryWords, setDictionaryWords] = useState<DictionaryWord[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [savingTasks, setSavingTasks] = useState<Record<string, boolean>>({});
  const [plannedTasks, setPlannedTasks] = useState<PlannedTask[]>([]);
  const [openedRequestId, setOpenedRequestId] = useState<number | null>(null);
  const [deletedTasks, setDeletedTasks] = useState<DeletedTask[]>([]);
  const [startingPlannedTaskIds, setStartingPlannedTaskIds] = useState<
    Record<number, boolean>
  >({});
  const deletingTaskIds = useRef(new Set<string>());

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, can_access_workday")
        .eq("id", user.id)
        .single();
      if (
        profile?.role !== "admin" &&
        profile?.can_access_workday !== true
      ) {
        router.replace("/summary");
        return;
      }

      setUser(user);
      await checkSession(user);
      await loadDictionary(user.id);
      await loadTodayPlannedTasks(user.id);
      await loadDeletedTasks(user.id);
      await supabase.rpc("purge_expired_own_deleted_tasks");
      setLoading(false);
    };

    getUser();
  }, [router]);

  useEffect(() => {
    if (user && sessionId) {
      loadSavedTasks(user.id, sessionId);
    }
  }, [user, sessionId]);

  useEffect(() => {
    const autoSave = async () => {
      for (const task of tasks) {
        const title = task.title.trim();
        const notes = task.notes.trim();

        if (!title || !notes || task.supabaseTaskId || savingTasks[task.id])
          continue;

        await saveTaskToDB(task);
      }
    };

    const timeout = setTimeout(autoSave, 1000);
    return () => clearTimeout(timeout);
  }, [tasks, savingTasks]);

  const normalizeDictionaryWord = (value: string) => {
    return value.trim().replace(/^#+/, "").replace(/\s+/g, "_");
  };

  const loadSavedTasks = async (userId: string, activeSessionId: number) => {
    const { data: logs } = await supabase
      .from("task_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("session_id", activeSessionId)
      .is("deleted_at", null)
      .order("start_time", { ascending: true });

    if (!logs || logs.length === 0) {
      setTasks([]);
      return;
    }

    const { data: images } = await supabase
      .from("task_images")
      .select("*")
      .eq("user_id", userId);

    const taskLogIds = logs.map((log: any) => log.id);
    const { data: linkedPlannedTasks } =
      taskLogIds.length > 0
        ? await supabase
            .from("planned_tasks")
            .select("id, task_log_id, transport_request_id")
            .in("task_log_id", taskLogIds)
        : { data: [] };

    const restoredTasks: Task[] = logs.map((log: any) => {
      const uploaded =
        images
          ?.filter((img: any) => img.task_log_id === log.id)
          .map((img: any) => img.url) || [];

      const status: Task["status"] = log.end_time
        ? "finished"
        : log.start_time
          ? "active"
          : "starting";

      return {
        id: `task-log-${log.id}`,
        title: log.title ?? "",
        notes: log.note ?? "",
        tags: [],
        images: [],
        uploadedImageUrls: uploaded,
        status,
        startTime: log.start_time ? new Date(log.start_time) : undefined,
        endTime: log.end_time ? new Date(log.end_time) : undefined,
        supabaseTaskId: log.id,
        plannedTaskId: linkedPlannedTasks?.find(
          (planned: any) => planned.task_log_id === log.id,
        )?.id,
        transportRequestId: linkedPlannedTasks?.find(
          (planned: any) => planned.task_log_id === log.id,
        )?.transport_request_id,
      };
    });

    setTasks(restoredTasks);
  };

  const loadDeletedTasks = async (userId: string) => {
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data } = await supabase
      .from("task_logs")
      .select("id, title, note, deleted_at")
      .eq("user_id", userId)
      .not("deleted_at", "is", null)
      .gte("deleted_at", sevenDaysAgo)
      .order("deleted_at", { ascending: false });

    setDeletedTasks((data || []) as DeletedTask[]);
  };

  const loadTodayPlannedTasks = async (userId: string) => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Riga",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const { data: plannedRows } = await supabase
      .from("planned_tasks")
      .select("id, title, note, scheduled_time, position, transport_request_id")
      .eq("assignee_id", userId)
      .eq("scheduled_date", today)
      .eq("status", "planned")
      .order("position", { ascending: true });

    if (!plannedRows || plannedRows.length === 0) {
      setPlannedTasks([]);
      return;
    }

    const plannedIds = plannedRows.map((task) => task.id);
    const { data: plannedImages } = await supabase
      .from("planned_task_images")
      .select("planned_task_id, url")
      .in("planned_task_id", plannedIds);

    setPlannedTasks(
      plannedRows.map((task) => ({
        ...task,
        imageUrls:
          plannedImages
            ?.filter((image) => image.planned_task_id === task.id)
            .map((image) => image.url) || [],
      })),
    );
  };

  const checkSession = async (currentUser: User) => {
    const { data } = await supabase
      .from("work_logs")
      .select("*")
      .eq("user_id", currentUser.id)
      .is("end_time", null)
      .order("start_time", { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      setSessionId(data[0].id);
      setWorkdayState("active");
    }
  };

  const loadDictionary = async (userId: string) => {
    const { data } = await supabase
      .from("tags")
      .select("name, usage_count")
      .eq("user_id", userId);

    if (!data) {
      setDictionaryWords([]);
      return;
    }

    const mapped: DictionaryWord[] = data.map((row: any) => ({
      name: row.name,
      usageCount: row.usage_count ?? 0,
    }));

    setDictionaryWords(mapped);
  };

  const saveDictionaryWord = async (userId: string, rawWord: string) => {
    const cleanWord = normalizeDictionaryWord(rawWord);
    if (!cleanWord) return;

    const { data: existingWords } = await supabase
      .from("tags")
      .select("id, name, usage_count")
      .eq("user_id", userId);

    const existing = existingWords?.find(
      (row: any) => String(row.name).toLowerCase() === cleanWord.toLowerCase(),
    );

    if (existing) {
      await supabase
        .from("tags")
        .update({ usage_count: (existing.usage_count ?? 0) + 1 })
        .eq("id", existing.id);
    } else {
      await supabase.from("tags").insert({
        name: cleanWord,
        usage_count: 1,
        user_id: userId,
      });
    }

    await loadDictionary(userId);
  };

  const saveDictionaryWords = async (userId: string, rawWords: string[]) => {
    const uniqueWords = [
      ...new Set(rawWords.map(normalizeDictionaryWord).filter(Boolean)),
    ];
    if (uniqueWords.length === 0) return;

    const { data: existingWords } = await supabase
      .from("tags")
      .select("id, name, usage_count")
      .eq("user_id", userId);

    for (const cleanWord of uniqueWords) {
      const existing = existingWords?.find(
        (row: any) =>
          String(row.name).toLowerCase() === cleanWord.toLowerCase(),
      );

      if (existing) {
        await supabase
          .from("tags")
          .update({ usage_count: (existing.usage_count ?? 0) + 1 })
          .eq("id", existing.id);
      } else {
        await supabase.from("tags").insert({
          name: cleanWord,
          usage_count: 1,
          user_id: userId,
        });
      }
    }

    await loadDictionary(userId);
  };

  const uploadImages = async (
    task: Task,
    taskLogId: number,
  ): Promise<string[]> => {
    if (!user) return [];

    const urls: string[] = [];

    for (const image of task.images) {
      const fileName = `${user.id}/${taskLogId}/${Date.now()}-${image.name}`;

      let fileToUpload = image;
      try {
        fileToUpload = await addPhotoTimestamp(image);
      } catch (error) {
        console.error("Kļūda pievienojot foto laiku:", error);
      }

      const { error: uploadError } = await supabase.storage
        .from("task-images")
        .upload(fileName, fileToUpload, { contentType: fileToUpload.type });

      if (!uploadError) {
        const publicUrl = supabase.storage
          .from("task-images")
          .getPublicUrl(fileName).data.publicUrl;

        urls.push(publicUrl);

        await supabase.from("task_images").insert({
          user_id: user.id,
          task_log_id: taskLogId,
          url: publicUrl,
        });
      }
    }

    return urls;
  };

  const saveTaskToDB = async (task: Task) => {
    if (!user) return;
    if (!sessionId) return;

    if (task.supabaseTaskId || savingTasks[task.id]) return;

    setSavingTasks((prev) => ({ ...prev, [task.id]: true }));

    try {
      const startISO = (
        task.startTime ? new Date(task.startTime) : new Date()
      ).toISOString();
      const endISO =
        task.status === "finished"
          ? (task.endTime ? new Date(task.endTime) : new Date()).toISOString()
          : null;

      const { data, error } = await supabase
        .from("task_logs")
        .insert([
          {
            session_id: sessionId,
            title: task.title,
            note: task.notes,
            start_time: startISO,
            end_time: endISO,
            user_id: user.id,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Saglabāšanas kļūda:", error.message);
        return;
      }

      if (data) {
        const uploadedUrls = await uploadImages(task, data.id);
        if (task.uploadedImageUrls.length > 0) {
          await supabase.from("task_images").insert(
            task.uploadedImageUrls.map((url) => ({
              user_id: user.id,
              task_log_id: data.id,
              url,
            })),
          );
        }
        if (task.plannedTaskId) {
          await supabase.rpc("update_assigned_planned_task_status", {
            target_id: task.plannedTaskId,
            target_status: "started",
            linked_task_log_id: data.id,
          });
          if (task.status === "finished") {
            await supabase.rpc("update_assigned_planned_task_status", {
              target_id: task.plannedTaskId,
              target_status: "completed",
              linked_task_log_id: data.id,
            });
          }
          setPlannedTasks((current) =>
            current.filter((item) => item.id !== task.plannedTaskId),
          );
        }
        updateTask(task.id, {
          uploadedImageUrls: [...task.uploadedImageUrls, ...uploadedUrls],
          supabaseTaskId: data.id,
        });
      }
    } finally {
      setSavingTasks((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
    }
  };

  const startWorkday = async () => {
    if (!user) return;

    const { data } = await supabase
      .from("work_logs")
      .insert([
        {
          user_id: user.id,
          project: "Darba diena",
          start_time: new Date().toISOString(),
          description: "",
        },
      ])
      .select()
      .single();

    if (data) {
      setWorkdayState("active");
      setSessionId(data.id);
    }
  };

  const endWorkday = async () => {
    if (!user) return;

    const { data: unfinishedTasks } = await supabase
      .from("task_logs")
      .select("*")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .is("end_time", null);

    if (unfinishedTasks && unfinishedTasks.length > 0) {
      alert("Vispirms pabeidz visus uzdevumus!");
      return;
    }

    const { data } = await supabase
      .from("work_logs")
      .select("*")
      .eq("user_id", user.id)
      .is("end_time", null)
      .order("start_time", { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const id = data[0].id;

      await supabase
        .from("work_logs")
        .update({ end_time: new Date().toISOString() })
        .eq("id", id);

      setWorkdayState("inactive");
      setTasks([]);
      setSessionId(null);
    }
  };

  const addNewTask = () => {
    const newTask: Task = {
      id: makeLocalId(),
      title: "",
      notes: "",
      tags: [],
      images: [],
      uploadedImageUrls: [],
      status: "starting",
    };

    setTasks((prev) => [...prev, newTask]);
  };

  const startPlannedTask = async (plannedTask: PlannedTask) => {
    if (
      workdayState !== "active" ||
      !sessionId ||
      startingPlannedTaskIds[plannedTask.id]
    ) {
      return;
    }

    setStartingPlannedTaskIds((current) => ({
      ...current,
      [plannedTask.id]: true,
    }));
    try {
      const { error } = await supabase.rpc("start_assigned_planned_task", {
        target_id: plannedTask.id,
        target_session_id: sessionId,
      });
      if (error) {
        alert(
          error.message.includes("already been started")
            ? "Šis uzdevums jau ir sākts."
            : `Uzdevumu neizdevās sākt: ${error.message}`,
        );
        await loadTodayPlannedTasks(user!.id);
        await loadSavedTasks(user!.id, sessionId);
        return;
      }

      setPlannedTasks((current) =>
        current.filter((item) => item.id !== plannedTask.id),
      );
      await loadSavedTasks(user!.id, sessionId);
    } finally {
      setStartingPlannedTaskIds((current) => {
        const next = { ...current };
        delete next[plannedTask.id];
        return next;
      });
    }
  };

  const updateTask = async (id: string, updated: Partial<Task>) => {
    const existing = tasks.find((task) => task.id === id);

    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, ...updated } : task)),
    );

    if (!existing?.supabaseTaskId) return;

    const updates: any = {};

    if (typeof updated.title === "string") updates.title = updated.title.trim();
    if (typeof updated.notes === "string") updates.note = updated.notes.trim();

    if (updated.status === "finished" && updated.endTime) {
      updates.end_time = new Date(updated.endTime).toISOString();
      if (existing.plannedTaskId) {
        await supabase.rpc("update_assigned_planned_task_status", {
          target_id: existing.plannedTaskId,
          target_status: "completed",
          linked_task_log_id: existing.supabaseTaskId,
        });
      }
    }

    if (Object.keys(updates).length > 0) {
      await supabase
        .from("task_logs")
        .update(updates)
        .eq("id", existing.supabaseTaskId);
    }
  };

  const deleteTask = async (id: string) => {
    if (deletingTaskIds.current.has(id)) return;
    const taskToDelete = tasks.find((task) => task.id === id);
    if (!taskToDelete) return;

    const confirmed = window.confirm(
      `Vai tiešām pārvietot uzdevumu “${taskToDelete.title || "Bez nosaukuma"}” uz Miskasti?\n\nTo varēs atjaunot 7 dienu laikā.`,
    );
    if (!confirmed) return;

    deletingTaskIds.current.add(id);
    setSavingTasks((current) => ({ ...current, [id]: true }));
    setTasks((current) => current.filter((task) => task.id !== id));

    try {
      if (taskToDelete.supabaseTaskId) {
        const { data, error } = await supabase.rpc("soft_delete_own_task", {
          target_task_log_id: taskToDelete.supabaseTaskId,
        });
        if (error || data !== true) {
          alert("Uzdevumu neizdevās pārvietot uz Miskasti.");
          setTasks((current) => {
            if (current.some((task) => task.id === taskToDelete.id)) {
              return current;
            }
            return [...current, taskToDelete].sort((a, b) => {
              const aTime = a.startTime?.getTime() ?? Number.MAX_SAFE_INTEGER;
              const bTime = b.startTime?.getTime() ?? Number.MAX_SAFE_INTEGER;
              return aTime - bTime;
            });
          });
          return;
        }
      }

      if (user) await loadDeletedTasks(user.id);
    } finally {
      deletingTaskIds.current.delete(id);
      setSavingTasks((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  };

  const restoreDeletedTask = async (taskId: number) => {
    const { data, error } = await supabase.rpc("restore_own_deleted_task", {
      target_task_log_id: taskId,
    });
    if (error || data !== true) {
      alert("Uzdevumu neizdevās atjaunot.");
      return;
    }
    if (user) await loadDeletedTasks(user.id);
    if (user && sessionId) await loadSavedTasks(user.id, sessionId);
  };

  if (loading) {
    return <div className="p-10 text-center">Notiek ielāde...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="space-y-4 rounded border p-4">
        <div className="flex justify-between">
          <button
            onClick={startWorkday}
            disabled={workdayState === "active"}
            className={`rounded px-4 py-2 text-white ${workdayState === "active" ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"}`}
          >
            Sākt darbadienu
          </button>

          <button
            onClick={endWorkday}
            disabled={workdayState === "inactive"}
            className={`rounded px-4 py-2 text-white ${workdayState === "inactive" ? "bg-gray-400" : "bg-red-600 hover:bg-red-700"}`}
          >
            Pabeigt darbadienu
          </button>
        </div>
      </div>

      {workdayState === "active" && (
        <div className="space-y-6">
          {plannedTasks.length > 0 && (
            <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
              <div>
                <h2 className="font-semibold">Šodien plānotie uzdevumi</h2>
                <p className="text-sm text-zinc-500">
                  Uzdevumi parādīti plānotajā secībā.
                </p>
              </div>
              {plannedTasks.map((plannedTask, index) => (
                <article
                  key={plannedTask.id}
                  className="rounded-lg border border-blue-200 bg-white p-3 dark:border-blue-900 dark:bg-zinc-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-blue-600">
                        {index + 1}.
                        {plannedTask.scheduled_time
                          ? ` · ${plannedTask.scheduled_time.slice(0, 5)}`
                          : ""}
                      </p>
                      <h3 className="font-semibold">{plannedTask.title}</h3>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">
                        {plannedTask.note}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => startPlannedTask(plannedTask)}
                        disabled={startingPlannedTaskIds[plannedTask.id] === true}
                        className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-zinc-500"
                      >
                        {startingPlannedTaskIds[plannedTask.id]
                          ? "Sāk..."
                          : "Sākt"}
                      </button>
                      {plannedTask.transport_request_id && (
                        <button
                          type="button"
                          onClick={() =>
                            setOpenedRequestId(
                              plannedTask.transport_request_id,
                            )
                          }
                          className="flex items-center justify-center gap-1 rounded-lg border border-violet-300 px-2 py-2 text-xs font-semibold text-violet-700 dark:border-violet-800 dark:text-violet-300"
                        >
                          <ExternalLink size={14} />
                          Pieteikums
                        </button>
                      )}
                    </div>
                  </div>
                  {plannedTask.imageUrls.length > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto">
                      {plannedTask.imageUrls.map((url) => (
                        <Image
                          key={url}
                          src={url}
                          alt=""
                          width={56}
                          height={56}
                          unoptimized
                          className="h-14 w-14 shrink-0 rounded object-cover"
                        />
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </section>
          )}

          {deletedTasks.length > 0 && (
            <details className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
              <summary className="cursor-pointer font-semibold">
                Miskaste ({deletedTasks.length})
              </summary>
              <p className="mt-2 text-sm text-zinc-500">
                Dzēstos uzdevumus var atjaunot 7 dienu laikā.
              </p>
              <div className="mt-3 space-y-2">
                {deletedTasks.map((deletedTask) => (
                  <div
                    key={deletedTask.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3 dark:border-amber-900 dark:bg-zinc-900"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {deletedTask.title || "Bez nosaukuma"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        Dzēsts {new Date(deletedTask.deleted_at).toLocaleString("lv-LV")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => restoreDeletedTask(deletedTask.id)}
                      className="shrink-0 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
                    >
                      Atjaunot
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}

          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              user={user}
              sessionId={sessionId}
              updateTask={updateTask}
              deleteTask={deleteTask}
              dictionaryWords={dictionaryWords}
              onAddDictionaryWord={async (word) => {
                if (!user) return;
                await saveDictionaryWord(user.id, word);
              }}
              onSaveDictionaryWords={async (words) => {
                if (!user) return;
                await saveDictionaryWords(user.id, words);
              }}
              setSavingTasks={setSavingTasks}
              savingTasks={savingTasks}
            />
          ))}
          <TransportRequestModal
            requestId={openedRequestId}
            onClose={() => setOpenedRequestId(null)}
          />

          {(() => {
            const last = tasks[tasks.length - 1];

            const canAdd =
              tasks.length === 0 ||
              (last &&
                (last.status === "active" || last.status === "finished") &&
                last.title.trim().length > 0 &&
                last.notes.trim().length > 0);

            return canAdd ? (
              <div>
                <button
                  onClick={addNewTask}
                  className="rounded bg-green-600 px-4 py-2 text-white"
                >
                  Sākt uzdevumu
                </button>
              </div>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}
