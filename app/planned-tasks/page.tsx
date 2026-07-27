"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ImagePlus, Pencil, Plus, Send, X } from "lucide-react";
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
};

type PlannedImage = {
  id: number;
  planned_task_id: number;
  url: string;
};

type DayTab = "planned" | "completed" | "canceled";

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
      ]);

      if (profileError || taskError || imageError) {
        setMessage("Neizdevās ielādēt plānotos uzdevumus.");
      }

      setUserId(authData.user.id);
      setProfiles((profileRows || []) as Profile[]);
      setTasks((taskRows || []) as PlannedTask[]);

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
        <button
          type="button"
          onClick={createDraft}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-green-600 px-3 py-2 font-medium text-white hover:bg-green-700"
        >
          <Plus size={18} />
          Jauns
        </button>
      </div>

      {message && (
        <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">
          {message}
        </p>
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
                <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                  Jauns
                </span>
                <button
                  type="button"
                  onClick={() => cancelTask(task)}
                  className="text-zinc-500 hover:text-red-600"
                  aria-label="Atcelt kartīti"
                >
                  <X size={20} />
                </button>
              </div>

              <input
                value={task.title}
                onChange={(event) =>
                  changeLocalTask(task.id, { title: event.target.value })
                }
                onBlur={() => saveDraft(task)}
                placeholder="Uzdevuma nosaukums"
                className="w-full rounded-lg border border-zinc-300 bg-transparent p-2 dark:border-zinc-600"
              />
              <textarea
                value={task.note}
                onChange={(event) =>
                  changeLocalTask(task.id, { note: event.target.value })
                }
                onBlur={() => saveDraft(task)}
                placeholder="Piezīmes"
                rows={4}
                className="w-full resize-y rounded-lg border border-zinc-300 bg-transparent p-2 dark:border-zinc-600"
              />

              <div className="grid gap-3 sm:grid-cols-3">
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
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Datums</span>
                  <input
                    type="date"
                    value={task.scheduled_date || ""}
                    onChange={(event) => {
                      const updated = {
                        ...task,
                        scheduled_date: event.target.value || null,
                      };
                      changeLocalTask(task.id, {
                        scheduled_date: event.target.value || null,
                      });
                      void saveDraft(updated);
                    }}
                    className="w-full rounded-lg border border-zinc-300 bg-transparent p-2 dark:border-zinc-600"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Laiks (nav obligāts)</span>
                  <input
                    type="time"
                    value={task.scheduled_time?.slice(0, 5) || ""}
                    onChange={(event) => {
                      const updated = {
                        ...task,
                        scheduled_time: event.target.value || null,
                      };
                      changeLocalTask(task.id, {
                        scheduled_time: event.target.value || null,
                      });
                      void saveDraft(updated);
                    }}
                    className="w-full rounded-lg border border-zinc-300 bg-transparent p-2 dark:border-zinc-600"
                  />
                </label>
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
    </div>
  );
}
