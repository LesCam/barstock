import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CreateTRPCClient } from "@trpc/client";
import type { AppRouter } from "@barstock/api";

const STORAGE_KEY = "@barstock/offlineQueue";

export interface QueueEntry {
  id: string;
  mutation: "sessions.addLine" | "sessions.updateLine" | "sessions.deleteLine";
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

async function loadQueue(): Promise<QueueEntry[]> {
  if (cachedQueue) return cachedQueue;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  cachedQueue = raw ? JSON.parse(raw) : [];
  return cachedQueue!;
}

async function persistQueue() {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cachedQueue ?? []));
}

export async function enqueue(
  mutation: QueueEntry["mutation"],
  input: Record<string, unknown>,
  tempId?: string,
): Promise<void> {
  const queue = await loadQueue();
  const id = `oq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  queue.push({
    id,
    mutation,
    input,
    tempId,
    createdAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
  });
  await persistQueue();
  notify();
}

export async function getQueue(): Promise<QueueEntry[]> {
  return loadQueue();
}

export async function removeEntry(id: string): Promise<void> {
  const queue = await loadQueue();
  cachedQueue = queue.filter((e) => e.id !== id);
  await persistQueue();
  notify();
}

export async function clearAll(): Promise<void> {
  cachedQueue = [];
  await persistQueue();
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
      msg.includes("enotfound")
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

function isNotFoundError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.toLowerCase().includes("not found");
  }
  return false;
}

const BACKOFF_DELAYS = [1000, 3000, 9000];

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
    if (entry.status === "failed") continue; // skip already-failed entries

    entry.status = "syncing";
    notify();

    try {
      await executeMutation(client, entry);
      toRemove.push(entry.id);
      synced++;
    } catch (err) {
      if (isSessionClosedError(err)) {
        // Remove ALL remaining entries for this session
        const sessionId = (entry.input as any).sessionId;
        for (const e of queue) {
          if ((e.input as any).sessionId === sessionId) {
            toRemove.push(e.id);
          }
        }
        sessionClosed = true;
        break; // stop processing
      } else if (isNotFoundError(err)) {
        entry.status = "failed";
        entry.error = (err as Error).message;
        failed++;
      } else if (isNetworkError(err)) {
        // Retry with exponential backoff
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
              failed++;
              succeeded = true; // don't double-count
              break;
            }
          }
        }
        if (!succeeded) {
          entry.status = "failed";
          entry.error = "Network error after 3 retries";
          failed++;
        }
      } else {
        entry.status = "failed";
        entry.error = (err as Error).message;
        failed++;
      }
    }
  }

  // Remove synced entries
  cachedQueue = queue.filter((e) => !toRemove.includes(e.id));
  await persistQueue();
  syncing = false;
  notify();

  return { synced, failed, sessionClosed };
}
