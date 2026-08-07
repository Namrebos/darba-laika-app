"use client";

const DB_NAME = "darba-laiks-offline";
const DB_VERSION = 1;
const STORE = "records";

export type OfflineTaskRecord = {
  localId: string;
  serverId?: number;
  plannedTaskId?: number;
  transportRequestId?: number;
  title: string;
  notes: string;
  startTime: string;
  endTime: string | null;
  deleted: boolean;
  images: Blob[];
  uploadedImageUrls: string[];
};

export type OfflineWorkdayRecord = {
  userId: string;
  localId: string;
  serverId?: number;
  startTime: string;
  endTime: string | null;
  tasks: OfflineTaskRecord[];
  updatedAt: string;
  needsSync: boolean;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

const workdayKey = (userId: string) => `workday:${userId}`;
const accessKey = (userId: string) => `access:${userId}`;

export async function getOfflineWorkday(userId: string) {
  return withStore<OfflineWorkdayRecord | undefined>("readonly", (store) =>
    store.get(workdayKey(userId)),
  );
}

export async function saveOfflineWorkday(
  record: OfflineWorkdayRecord,
  options: { needsSync?: boolean } = {},
) {
  await withStore("readwrite", (store) =>
    store.put(
      {
        ...record,
        needsSync: options.needsSync ?? true,
        updatedAt: new Date().toISOString(),
      },
      workdayKey(record.userId),
    ),
  );
  window.dispatchEvent(new CustomEvent("offline-data-changed"));
}

export async function clearOfflineWorkday(userId: string) {
  await withStore("readwrite", (store) => store.delete(workdayKey(userId)));
  window.dispatchEvent(new CustomEvent("offline-data-changed"));
}

export async function saveCachedAccess(userId: string, value: unknown) {
  await withStore("readwrite", (store) => store.put(value, accessKey(userId)));
}

export async function getCachedAccess<T>(userId: string): Promise<T | undefined> {
  return withStore<T | undefined>("readonly", (store) => store.get(accessKey(userId)));
}

export function newOfflineId() {
  return crypto.randomUUID();
}

export function isNetworkError(error: unknown) {
  if (!navigator.onLine) return true;
  const text = error instanceof Error ? error.message : String(error || "");
  return /fetch|network|offline|load failed/i.test(text);
}
