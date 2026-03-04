import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CreateTRPCClient } from "@trpc/client";
import type { AppRouter } from "@barstock/api";

const STORAGE_KEY = "@barstock/offlineQueue";

export interface ConflictValues {
  countUnits?: number;
  grossWeightGrams?: number;
  percentRemaining?: number;
  updatedBy?: string;
}

export type MutationType =
  | "sessions.create"
  | "sessions.addLine"
  | "sessions.updateLine"
  | "sessions.deleteLine"
  | "sessions.join"
  | "sessions.close"
  | "inventory.create"
  | "receiving.receive"
  | "transfers.create";

/** Processing priority — lower numbers run first */
const MUTATION_PRIORITY: Record<MutationType, number> = {
  "sessions.create": 0,
  "inventory.create": 1,
  "sessions.join": 2,
  "sessions.addLine": 3,
  "sessions.updateLine": 4,
  "sessions.deleteLine": 4,
  "receiving.receive": 5,
  "transfers.create": 5,
  "sessions.close": 6,
};

export interface QueueEntry {
  id: string;
  mutation: MutationType;
  input: Record<string, unknown>;
  tempId?: string;
  createdAt: string;
  status: "pending" | "syncing" | "failed" | "conflict";
  retryCount: number;
  priority: number;
  error?: string;
  conflictData?: {
    myValues: ConflictValues;
    theirValues: ConflictValues;
    theirName?: string;
  };
}

type Listener = (queue: QueueEntry[]) => void;

let cachedQueue: QueueEntry[] | null = null;
const listeners = new Set<Listener>();
let syncing = false;

function notify() {
  const q = [...(cachedQueue ?? [])];
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
    priority: MUTATION_PRIORITY[mutation] ?? 5,
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

/**
 * Resolve a conflict entry by choosing "mine" (re-enqueue with force) or "theirs" (discard).
 */
export async function resolveConflict(
  entryId: string,
  resolution: "mine" | "theirs",
): Promise<void> {
  const queue = await loadQueue();
  const idx = queue.findIndex((e) => e.id === entryId);
  if (idx === -1) return;

  if (resolution === "theirs") {
    // Discard the offline mutation — server value wins
    cachedQueue = queue.filter((e) => e.id !== entryId);
  } else {
    // Re-enqueue as pending, strip expectedUpdatedAt so it overwrites
    const entry = queue[idx];
    const { expectedUpdatedAt, ...rest } = entry.input as any;
    entry.input = rest;
    entry.status = "pending";
    entry.retryCount = 0;
    entry.error = undefined;
    entry.conflictData = undefined;
  }
  await persistQueue();
  notify();
}

/**
 * Remove all queued entries for a given session.
 * Returns the count of entries removed.
 */
export async function removeEntriesForSession(sessionId: string): Promise<number> {
  const queue = await loadQueue();
  const before = queue.length;
  cachedQueue = queue.filter((e) => {
    const input = e.input as any;
    return input.sessionId !== sessionId;
  });
  const removed = before - cachedQueue.length;
  if (removed > 0) {
    await persistQueue();
    notify();
  }
  return removed;
}

async function executeMutation(
  client: CreateTRPCClient<AppRouter>,
  entry: QueueEntry,
): Promise<void> {
  const input = entry.input as any;
  switch (entry.mutation) {
    case "sessions.create":
      await client.sessions.create.mutate(input);
      break;
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
      await client.sessions.join.mutate(input);
      break;
    case "receiving.receive":
      await client.receiving.receive.mutate(input);
      break;
    case "sessions.close":
      await client.sessions.close.mutate(input);
      break;
    case "inventory.create":
      await client.inventory.create.mutate(input);
      break;
    case "transfers.create":
      await client.transfers.create.mutate(input);
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
    const msg = err.message.toLowerCase();
    return msg.includes("session already closed") || msg.includes("cannot join a closed session");
  }
  return false;
}

function isNotFoundError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.toLowerCase().includes("not found");
  }
  return false;
}

function isAlreadyExistsError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("already exists") || msg.includes("unique constraint");
  }
  return false;
}

function isConflictError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("conflict")) return true;
    // tRPC wraps errors with JSON shape { type: "CONFLICT" }
    try {
      const parsed = JSON.parse(err.message);
      if (parsed?.type === "CONFLICT") return true;
    } catch {
      // not JSON, ignore
    }
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
    }
    // Don't auto-retry conflict entries — those need manual resolution
  }
  await persistQueue();
  notify();
  return processQueue(client);
}

/**
 * Remove all failed entries from the queue.
 */
export async function clearFailed(): Promise<void> {
  const queue = await loadQueue();
  cachedQueue = queue.filter((e) => e.status !== "failed");
  await persistQueue();
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

  // Sort by priority ASC, then by timestamp ASC for stable ordering
  const sorted = [...queue].sort((a, b) => {
    const pDiff = (a.priority ?? 5) - (b.priority ?? 5);
    if (pDiff !== 0) return pDiff;
    return a.createdAt.localeCompare(b.createdAt);
  });

  for (const entry of sorted) {
    if (entry.status === "failed" || entry.status === "conflict") continue; // skip already-failed/conflict entries

    entry.status = "syncing";
    notify();

    try {
      await executeMutation(client, entry);
      toRemove.push(entry.id);
      synced++;
    } catch (err) {
      if (
        isAlreadyExistsError(err) &&
        (entry.mutation === "sessions.create" || entry.mutation === "inventory.create")
      ) {
        // Idempotent: item was created on a previous sync attempt
        toRemove.push(entry.id);
        synced++;
      } else if (isSessionClosedError(err)) {
        // Remove ALL remaining entries for this session
        const sessionId = (entry.input as any).sessionId;
        for (const e of queue) {
          if ((e.input as any).sessionId === sessionId) {
            toRemove.push(e.id);
          }
        }
        sessionClosed = true;
        break; // stop processing
      } else if (isConflictError(err)) {
        // Parse conflict data and mark entry for user resolution
        let theirValues: Record<string, unknown> = {};
        let theirName: string | undefined;
        try {
          const parsed = JSON.parse((err as Error).message);
          theirValues = parsed.theirValues ?? {};
          theirName = parsed.theirName;
        } catch {
          // Not parseable, keep defaults
        }
        entry.status = "conflict";
        entry.conflictData = {
          myValues: entry.input as any,
          theirValues: theirValues as any,
          theirName,
        };
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
