"use client";

import { supabase } from "@/lib/supabaseClient";
import {
  clearOfflineWorkday,
  getOfflineWorkday,
  saveOfflineWorkday,
  type OfflineWorkdayRecord,
} from "@/lib/offlineStore";

let syncing = false;

export async function syncOfflineWorkday(userId: string) {
  if (syncing || !navigator.onLine) return false;
  const record = await getOfflineWorkday(userId);
  if (!record) return true;

  syncing = true;
  window.dispatchEvent(new CustomEvent("offline-sync-status", { detail: { syncing: true } }));
  try {
    const { data: workdayData, error: workdayError } = await supabase.rpc(
      "sync_offline_workday",
      {
        client_id: record.localId,
        started_at: record.startTime,
        ended_at: record.endTime,
      },
    );
    if (workdayError) throw workdayError;
    record.serverId = Number(workdayData);

    for (const task of record.tasks) {
      const { data: taskData, error: taskError } = await supabase.rpc(
        "sync_offline_task",
        {
          client_id: task.localId,
          workday_client_id: record.localId,
          task_title: task.title,
          task_note: task.notes,
          started_at: task.startTime,
          ended_at: task.endTime,
          planned_task_id: task.plannedTaskId ?? null,
          is_deleted: task.deleted,
          existing_task_id: task.serverId ?? null,
        },
      );
      if (taskError) throw taskError;
      task.serverId = taskData === null ? undefined : Number(taskData);

      if (!task.deleted && task.serverId && task.images.length > 0) {
        for (const [index, blob] of task.images.entries()) {
          const path = `${userId}/${task.serverId}/offline-${task.localId}-${index}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from("task-images")
            .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: true });
          if (uploadError) throw uploadError;
          const url = supabase.storage.from("task-images").getPublicUrl(path).data.publicUrl;
          const { error: imageError } = await supabase.from("task_images").upsert(
            { user_id: userId, task_log_id: task.serverId, url },
            { onConflict: "task_log_id,url", ignoreDuplicates: true },
          );
          if (imageError) throw imageError;
          if (!task.uploadedImageUrls.includes(url)) task.uploadedImageUrls.push(url);
        }
        task.images = [];
      }
    }

    record.tasks = record.tasks.filter((task) => !task.deleted);

    if (record.endTime) {
      await clearOfflineWorkday(userId);
    } else {
      await saveOfflineWorkday(record);
    }
    window.dispatchEvent(new CustomEvent("offline-sync-complete", { detail: record }));
    return true;
  } catch (error) {
    console.error("Bezsaistes datu sinhronizācijas kļūda:", error);
    await saveOfflineWorkday(record);
    window.dispatchEvent(new CustomEvent("offline-sync-error"));
    return false;
  } finally {
    syncing = false;
    window.dispatchEvent(new CustomEvent("offline-sync-status", { detail: { syncing: false } }));
  }
}

export async function persistWorkday(record: OfflineWorkdayRecord) {
  await saveOfflineWorkday(record);
  if (navigator.onLine) void syncOfflineWorkday(record.userId);
}
