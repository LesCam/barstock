import { openDB, type IDBPDatabase } from "idb";
import type { CreateTRPCClient } from "@trpc/client";
import type { AppRouter } from "@barstock/api";

const DB_NAME = "barstock-offline";
const DB_VERSION = 1;
const STORE_NAME = "queue";

export interface QueueEntry {
  id: string;
  mutation:
    | "sessions.addLine"
    | "sessions.updateLine"
    | "sessions.deleteLine"
    | "sessions.join"
    | "sessions.heartbeat"
    | "sessions.claimSubArea"
    | "sessions.releaseSubArea"
    | "inventory.bulkCreate"
    | "scanImport.addItem"
    | "scanImport.removeItem";
  input: Record<string, unknown>;
  tempId?: string;
  createdAt: string;
  status: "pending" | "syncing" | "failed";
  retryCount: number;
  error?: string;
}

type Listener = (queue: QueueEntry[]) => void;

let cachedQueue: QueueEntry[] | null = null;
const listeners = new Set<Listener>();
let syncing = false;

function notify() {
  const q = cachedQueue ?? [];
  for (const cb of listeners) cb(q);
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("by-status", "status");
          store.createIndex("by-created", "createdAt");
        }
      },
    });
  }
  return dbPromise;
}

async function loadQueue(): Promise<QueueEntry[]> {
  if (cachedQueue) return cachedQueue;
  const db = await getDB();
  cachedQueue = await db.getAllFromIndex(STORE_NAME, "by-created");
  return cachedQueue!;
}

async function persistEntry(entry: QueueEntry): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, entry);
}

async function deleteEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

async function clearStore(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
}

export async function enqueue(
  mutation: QueueEntry["mutation"],
  input: Record<string, unknown>,
  tempId?: string,
): Promise<void> {
  const queue = await loadQueue();
  const id = `oq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: QueueEntry = {
    id,
    mutation,
    input,
    tempId,
    createdAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
  };
  queue.push(entry);
  await persistEntry(entry);
  notify();
}

export async function getQueue(): Promise<QueueEntry[]> {
  return loadQueue();
}

export async function removeEntry(id: string): Promise<void> {
  const queue = await loadQueue();
  cachedQueue = queue.filter((e) => e.id !== id);
  await deleteEntry(id);
  notify();
}

export async function clearAll(): Promise<void> {
  cachedQueue = [];
  await clearStore();
  notify();
}

export function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  // Fire immediately with current state
  loadQueue().then((q) => cb(q));
  return () => {
    listeners.delete(cb);
  };
}

export function isSyncing(): boolean {
  return syncing;
}

async function executeMutation(
  client: CreateTRPCClient<AppRouter>,
  entry: QueueEntry,
): Promise<void> {
  const input = entry.input as any;
  switch (entry.mutation) {
    case "sessions.addLine":
      await client.sessions.addLine.mutate(input);
      break;
    case "sessions.updateLine":
      await client.sessions.updateLine.mutate(input);
      break;
    case "sessions.deleteLine":
      await client.sessions.deleteLine.mutate(input);
      break;
    case "sessions.join":
      await (client.sessions as any).join.mutate(input);
      break;
    case "sessions.heartbeat":
      await (client.sessions as any).heartbeat.mutate(input);
      break;
    case "sessions.claimSubArea":
      await client.sessions.claimSubArea.mutate(input);
      break;
    case "sessions.releaseSubArea":
      await client.sessions.releaseSubArea.mutate(input);
      break;
    case "inventory.bulkCreate":
      await (client.inventory as any).bulkCreate.mutate(input);
      break;
    case "scanImport.addItem":
      await (client.scanImport as any).addItem.mutate(input);
      break;
    case "scanImport.removeItem":
      await (client.scanImport as any).removeItem.mutate(input);
      break;
  }
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("fetch") ||
      msg.includes("econnrefused") ||
      msg.includes("enotfound") ||
      msg.includes("failed to fetch")
    );
  }
  return false;
}

function isSessionClosedError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.toLowerCase().includes("session already closed");
  }
  return false;
}

function isConflictError(err: unknown): boolean {
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message);
      return parsed.type === "CONFLICT";
    } catch {
      return false;
    }
  }
  return false;
}

function isNotFoundError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.toLowerCase().includes("not found");
  }
  return false;
}

const BACKOFF_DELAYS = [1000, 3000, 9000];

/**
 * Reset all failed entries to pending and re-process the queue.
 */
export async function retryFailed(
  client: CreateTRPCClient<AppRouter>,
): Promise<{ synced: number; failed: number; sessionClosed: boolean }> {
  const queue = await loadQueue();
  for (const entry of queue) {
    if (entry.status === "failed") {
      entry.status = "pending";
      entry.retryCount = 0;
      entry.error = undefined;
      await persistEntry(entry);
    }
  }
  notify();
  return processQueue(client);
}

/**
 * Remove all failed entries from the queue.
 */
export async function clearFailed(): Promise<void> {
  const queue = await loadQueue();
  const failed = queue.filter((e) => e.status === "failed");
  for (const entry of failed) {
    await deleteEntry(entry.id);
  }
  cachedQueue = queue.filter((e) => e.status !== "failed");
  notify();
}

export async function processQueue(
  client: CreateTRPCClient<AppRouter>,
): Promise<{ synced: number; failed: number; sessionClosed: boolean }> {
  if (syncing) return { synced: 0, failed: 0, sessionClosed: false };
  syncing = true;
  notify();

  const queue = await loadQueue();
  let synced = 0;
  let failed = 0;
  let sessionClosed = false;
  const toRemove: string[] = [];

  for (const entry of queue) {
    if (entry.status === "failed") continue;

    entry.status = "syncing";
    await persistEntry(entry);
    notify();

    try {
      await executeMutation(client, entry);
      toRemove.push(entry.id);
      synced++;
    } catch (err) {
      // updateLine conflict: retry without expectedUpdatedAt (server skips version check)
      if (entry.mutation === "sessions.updateLine" && isConflictError(err)) {
        try {
          const { expectedUpdatedAt, ...inputWithoutVersion } = entry.input;
          await client.sessions.updateLine.mutate(inputWithoutVersion as any);
          toRemove.push(entry.id);
          synced++;
          // Store notification about forced update
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("offline-conflict-resolved", {
                detail: { entryId: entry.id, mutation: entry.mutation },
              }),
            );
          }
          continue;
        } catch (retryErr) {
          entry.status = "failed";
          entry.error = (retryErr as Error).message;
          await persistEntry(entry);
          failed++;
          continue;
        }
      }

      if (isSessionClosedError(err)) {
        const sessionId = (entry.input as any).sessionId;
        for (const e of queue) {
          if ((e.input as any).sessionId === sessionId) {
            toRemove.push(e.id);
          }
        }
        sessionClosed = true;
        break;
      } else if (isNotFoundError(err)) {
        entry.status = "failed";
        entry.error = (err as Error).message;
        await persistEntry(entry);
        failed++;
      } else if (isNetworkError(err)) {
        let succeeded = false;
        for (let i = 0; i < BACKOFF_DELAYS.length && entry.retryCount < 3; i++) {
          entry.retryCount++;
          await new Promise((r) => setTimeout(r, BACKOFF_DELAYS[i]));
          try {
            await executeMutation(client, entry);
            toRemove.push(entry.id);
            synced++;
            succeeded = true;
            break;
          } catch (retryErr) {
            if (!isNetworkError(retryErr)) {
              entry.status = "failed";
              entry.error = (retryErr as Error).message;
              await persistEntry(entry);
              failed++;
              succeeded = true;
              break;
            }
          }
        }
        if (!succeeded) {
          entry.status = "failed";
          entry.error = "Network error after 3 retries";
          await persistEntry(entry);
          failed++;
        }
      } else {
        entry.status = "failed";
        entry.error = (err as Error).message;
        await persistEntry(entry);
        failed++;
      }
    }
  }

  // Remove synced entries
  for (const id of toRemove) {
    await deleteEntry(id);
  }
  cachedQueue = (cachedQueue ?? []).filter((e) => !toRemove.includes(e.id));
  syncing = false;
  notify();

  return { synced, failed, sessionClosed };
}
