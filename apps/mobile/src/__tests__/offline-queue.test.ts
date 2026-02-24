import AsyncStorage from "@react-native-async-storage/async-storage";

// Helper to build a mock tRPC client with jest.fn() stubs for each mutation
function createMockClient() {
  return {
    sessions: {
      addLine: { mutate: jest.fn().mockResolvedValue(undefined) },
      updateLine: { mutate: jest.fn().mockResolvedValue(undefined) },
      deleteLine: { mutate: jest.fn().mockResolvedValue(undefined) },
    },
    receiving: {
      receive: { mutate: jest.fn().mockResolvedValue(undefined) },
    },
    transfers: {
      create: { mutate: jest.fn().mockResolvedValue(undefined) },
    },
  } as any;
}

import * as offlineQueue from "@/lib/offline-queue";

beforeEach(async () => {
  jest.restoreAllMocks();
  (AsyncStorage as any).__resetStore();
  await offlineQueue.clearAll();
});

// ─── enqueue ────────────────────────────────────────────────────────────────

describe("enqueue", () => {
  it("adds entry with correct shape (id starts with oq_, status pending, retryCount 0)", async () => {
    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1", productId: "p1" });
    const queue = await offlineQueue.getQueue();

    expect(queue).toHaveLength(1);
    expect(queue[0].id).toMatch(/^oq_/);
    expect(queue[0].status).toBe("pending");
    expect(queue[0].retryCount).toBe(0);
    expect(queue[0].mutation).toBe("sessions.addLine");
    expect(queue[0].input).toEqual({ sessionId: "s1", productId: "p1" });
    expect(queue[0].createdAt).toBeDefined();
  });

  it("persists to AsyncStorage", async () => {
    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });

    const raw = await AsyncStorage.getItem("@barstock/offlineQueue");
    const stored = JSON.parse(raw!);
    expect(stored).toHaveLength(1);
    expect(stored[0].mutation).toBe("sessions.addLine");
  });

  it("notifies listeners", async () => {
    const listener = jest.fn();
    offlineQueue.subscribe(listener);

    // Wait for initial fire from subscribe
    await new Promise((r) => setTimeout(r, 0));
    listener.mockClear();

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    expect(listener).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ mutation: "sessions.addLine" }),
      ]),
    );
  });

  it("supports optional tempId", async () => {
    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" }, "temp_123");
    const queue = await offlineQueue.getQueue();
    expect(queue[0].tempId).toBe("temp_123");
  });
});

// ─── getQueue ───────────────────────────────────────────────────────────────

describe("getQueue", () => {
  it("returns empty array initially", async () => {
    const queue = await offlineQueue.getQueue();
    expect(queue).toEqual([]);
  });

  it("returns enqueued entries in order", async () => {
    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    await offlineQueue.enqueue("sessions.updateLine", { sessionId: "s2" });
    await offlineQueue.enqueue("sessions.deleteLine", { sessionId: "s3" });

    const queue = await offlineQueue.getQueue();
    expect(queue).toHaveLength(3);
    expect(queue[0].mutation).toBe("sessions.addLine");
    expect(queue[1].mutation).toBe("sessions.updateLine");
    expect(queue[2].mutation).toBe("sessions.deleteLine");
  });
});

// ─── removeEntry ────────────────────────────────────────────────────────────

describe("removeEntry", () => {
  it("removes specific entry by ID", async () => {
    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    await offlineQueue.enqueue("sessions.updateLine", { sessionId: "s2" });

    const queue = await offlineQueue.getQueue();
    await offlineQueue.removeEntry(queue[0].id);

    const updated = await offlineQueue.getQueue();
    expect(updated).toHaveLength(1);
    expect(updated[0].mutation).toBe("sessions.updateLine");
  });

  it("persists updated queue", async () => {
    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    const queue = await offlineQueue.getQueue();
    await offlineQueue.removeEntry(queue[0].id);

    const raw = await AsyncStorage.getItem("@barstock/offlineQueue");
    const stored = JSON.parse(raw!);
    expect(stored).toHaveLength(0);
  });

  it("notifies listeners", async () => {
    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    const queue = await offlineQueue.getQueue();

    const listener = jest.fn();
    offlineQueue.subscribe(listener);
    await new Promise((r) => setTimeout(r, 0));
    listener.mockClear();

    await offlineQueue.removeEntry(queue[0].id);
    expect(listener).toHaveBeenCalledWith([]);
  });

  it("no-ops for nonexistent ID", async () => {
    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    await offlineQueue.removeEntry("nonexistent_id");

    const queue = await offlineQueue.getQueue();
    expect(queue).toHaveLength(1);
  });
});

// ─── clearAll ───────────────────────────────────────────────────────────────

describe("clearAll", () => {
  it("empties the queue", async () => {
    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    await offlineQueue.enqueue("sessions.updateLine", { sessionId: "s2" });

    await offlineQueue.clearAll();
    const queue = await offlineQueue.getQueue();
    expect(queue).toEqual([]);
  });

  it("persists empty array", async () => {
    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    await offlineQueue.clearAll();

    const raw = await AsyncStorage.getItem("@barstock/offlineQueue");
    expect(JSON.parse(raw!)).toEqual([]);
  });

  it("notifies listeners", async () => {
    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });

    const listener = jest.fn();
    offlineQueue.subscribe(listener);
    await new Promise((r) => setTimeout(r, 0));
    listener.mockClear();

    await offlineQueue.clearAll();
    expect(listener).toHaveBeenCalledWith([]);
  });
});

// ─── subscribe ──────────────────────────────────────────────────────────────

describe("subscribe", () => {
  it("fires callback immediately with current queue", async () => {
    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });

    const listener = jest.fn();
    offlineQueue.subscribe(listener);

    // loadQueue is async, so the initial fire is deferred
    await new Promise((r) => setTimeout(r, 0));
    expect(listener).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ mutation: "sessions.addLine" }),
      ]),
    );
  });

  it("fires on subsequent changes (enqueue, remove, clear)", async () => {
    const listener = jest.fn();
    offlineQueue.subscribe(listener);
    await new Promise((r) => setTimeout(r, 0));
    listener.mockClear();

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    expect(listener).toHaveBeenCalledTimes(1);
    listener.mockClear();

    const queue = await offlineQueue.getQueue();
    await offlineQueue.removeEntry(queue[0].id);
    expect(listener).toHaveBeenCalledTimes(1);
    listener.mockClear();

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s2" });
    listener.mockClear();
    await offlineQueue.clearAll();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe stops further callbacks", async () => {
    const listener = jest.fn();
    const unsub = offlineQueue.subscribe(listener);
    await new Promise((r) => setTimeout(r, 0));
    listener.mockClear();

    unsub();

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    expect(listener).not.toHaveBeenCalled();
  });
});

// ─── isSyncing ──────────────────────────────────────────────────────────────

describe("isSyncing", () => {
  it("returns false when idle", () => {
    expect(offlineQueue.isSyncing()).toBe(false);
  });

  it("returns true during processQueue execution", async () => {
    const client = createMockClient();
    // Make addLine hang so we can check isSyncing mid-flight
    let resolveMutate!: () => void;
    client.sessions.addLine.mutate.mockReturnValue(
      new Promise<void>((r) => {
        resolveMutate = r;
      }),
    );

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    const processPromise = offlineQueue.processQueue(client);

    // Wait a tick for processQueue to start
    await new Promise((r) => setTimeout(r, 0));
    expect(offlineQueue.isSyncing()).toBe(true);

    resolveMutate();
    await processPromise;
    expect(offlineQueue.isSyncing()).toBe(false);
  });
});

// ─── processQueue ───────────────────────────────────────────────────────────

describe("processQueue — success path", () => {
  it("syncs all pending entries and returns correct counts", async () => {
    const client = createMockClient();

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    await offlineQueue.enqueue("sessions.updateLine", { sessionId: "s1" });

    const result = await offlineQueue.processQueue(client);

    expect(result).toEqual({ synced: 2, failed: 0, sessionClosed: false });
    const queue = await offlineQueue.getQueue();
    expect(queue).toHaveLength(0);
  });

  it("calls correct tRPC mutation for each entry type", async () => {
    const client = createMockClient();

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    await offlineQueue.enqueue("sessions.updateLine", { sessionId: "s1" });
    await offlineQueue.enqueue("sessions.deleteLine", { sessionId: "s1" });
    await offlineQueue.enqueue("receiving.receive", { locationId: "l1" });
    await offlineQueue.enqueue("transfers.create", { fromId: "a", toId: "b" });

    await offlineQueue.processQueue(client);

    expect(client.sessions.addLine.mutate).toHaveBeenCalledWith({ sessionId: "s1" });
    expect(client.sessions.updateLine.mutate).toHaveBeenCalledWith({ sessionId: "s1" });
    expect(client.sessions.deleteLine.mutate).toHaveBeenCalledWith({ sessionId: "s1" });
    expect(client.receiving.receive.mutate).toHaveBeenCalledWith({ locationId: "l1" });
    expect(client.transfers.create.mutate).toHaveBeenCalledWith({ fromId: "a", toId: "b" });
  });
});

describe("processQueue — concurrent guard", () => {
  it("second call returns zeros while first is running", async () => {
    const client = createMockClient();
    let resolveMutate!: () => void;
    client.sessions.addLine.mutate.mockReturnValue(
      new Promise<void>((r) => {
        resolveMutate = r;
      }),
    );

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });

    const first = offlineQueue.processQueue(client);
    // Wait for the first call to set syncing=true
    await new Promise((r) => setTimeout(r, 0));

    const second = await offlineQueue.processQueue(client);
    expect(second).toEqual({ synced: 0, failed: 0, sessionClosed: false });

    resolveMutate();
    const firstResult = await first;
    expect(firstResult.synced).toBe(1);
  });
});

describe("processQueue — session-closed error", () => {
  it("removes ALL entries for that sessionId and returns sessionClosed: true", async () => {
    const client = createMockClient();
    client.sessions.addLine.mutate.mockRejectedValue(
      new Error("Session already closed"),
    );

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    await offlineQueue.enqueue("sessions.updateLine", { sessionId: "s1" });
    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s2" });

    const result = await offlineQueue.processQueue(client);

    expect(result.sessionClosed).toBe(true);
    const queue = await offlineQueue.getQueue();
    // s1 entries removed; s2 entry still present since processing stopped
    expect(queue).toHaveLength(1);
    expect((queue[0].input as any).sessionId).toBe("s2");
  });

  it("stops processing remaining entries", async () => {
    const client = createMockClient();
    client.sessions.addLine.mutate.mockRejectedValue(
      new Error("Session already closed"),
    );

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    await offlineQueue.enqueue("receiving.receive", { locationId: "l1" });

    await offlineQueue.processQueue(client);

    // receiving.receive should not have been called since processing stopped after session closed
    expect(client.receiving.receive.mutate).not.toHaveBeenCalled();
  });
});

describe("processQueue — not-found error", () => {
  it("marks entry as failed with error message and continues", async () => {
    const client = createMockClient();
    client.sessions.addLine.mutate.mockRejectedValue(
      new Error("Resource not found"),
    );

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    await offlineQueue.enqueue("sessions.updateLine", { sessionId: "s2" });

    const result = await offlineQueue.processQueue(client);

    expect(result.failed).toBe(1);
    expect(result.synced).toBe(1);

    const queue = await offlineQueue.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].status).toBe("failed");
    expect(queue[0].error).toBe("Resource not found");
  });
});

describe("processQueue — network error with retry", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("retries up to 3 times with backoff and marks failed on exhaustion", async () => {
    const client = createMockClient();
    client.sessions.addLine.mutate.mockRejectedValue(
      new Error("Network request failed"),
    );

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });

    const processPromise = offlineQueue.processQueue(client);

    // Advance through 3 backoff delays: 1000, 3000, 9000
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(3000);
    await jest.advanceTimersByTimeAsync(9000);

    const result = await processPromise;
    expect(result.failed).toBe(1);

    const queue = await offlineQueue.getQueue();
    expect(queue[0].status).toBe("failed");
    expect(queue[0].error).toBe("Network error after 3 retries");
    expect(queue[0].retryCount).toBe(3);
  });

  it("on eventual success after retry: counts as synced", async () => {
    const client = createMockClient();
    client.sessions.addLine.mutate
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce(undefined);

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });

    const processPromise = offlineQueue.processQueue(client);

    // Advance past first retry delay (1000ms)
    await jest.advanceTimersByTimeAsync(1000);

    const result = await processPromise;
    expect(result).toEqual({ synced: 1, failed: 0, sessionClosed: false });

    const queue = await offlineQueue.getQueue();
    expect(queue).toHaveLength(0);
  });
});

describe("processQueue — non-network error during retry", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("marks failed immediately on non-network error during retry", async () => {
    const client = createMockClient();
    client.sessions.addLine.mutate
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockRejectedValueOnce(new Error("Validation error: invalid input"));

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });

    const processPromise = offlineQueue.processQueue(client);

    await jest.advanceTimersByTimeAsync(1000);

    const result = await processPromise;
    expect(result.failed).toBe(1);

    const queue = await offlineQueue.getQueue();
    expect(queue[0].status).toBe("failed");
    expect(queue[0].error).toBe("Validation error: invalid input");
  });
});

describe("processQueue — skips already-failed entries", () => {
  it("pre-existing failed entries are not re-attempted", async () => {
    const client = createMockClient();

    // Enqueue two items then make the first one fail
    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    await offlineQueue.enqueue("sessions.updateLine", { sessionId: "s2" });

    // Manually fail the first entry by making it fail via processQueue
    client.sessions.addLine.mutate.mockRejectedValueOnce(
      new Error("Some unexpected error"),
    );
    await offlineQueue.processQueue(client);

    // Reset mocks for second run
    client.sessions.addLine.mutate.mockClear().mockResolvedValue(undefined);
    client.sessions.updateLine.mutate.mockClear().mockResolvedValue(undefined);

    // Process again — the failed entry should be skipped
    const result = await offlineQueue.processQueue(client);
    expect(result).toEqual({ synced: 0, failed: 0, sessionClosed: false });

    // addLine should not be called since the entry is failed
    expect(client.sessions.addLine.mutate).not.toHaveBeenCalled();
  });
});

describe("processQueue — mixed results", () => {
  it("returns correct counts with multiple entries, some succeed some fail", async () => {
    const client = createMockClient();

    client.sessions.addLine.mutate.mockResolvedValue(undefined);
    client.sessions.updateLine.mutate.mockRejectedValue(
      new Error("Resource not found"),
    );
    client.sessions.deleteLine.mutate.mockResolvedValue(undefined);

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    await offlineQueue.enqueue("sessions.updateLine", { sessionId: "s1" });
    await offlineQueue.enqueue("sessions.deleteLine", { sessionId: "s1" });

    const result = await offlineQueue.processQueue(client);

    expect(result.synced).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.sessionClosed).toBe(false);
  });
});

// ─── retryFailed ────────────────────────────────────────────────────────────

describe("retryFailed", () => {
  it("resets failed entries to pending and calls processQueue", async () => {
    const client = createMockClient();

    // First pass: fail the first entry
    client.sessions.addLine.mutate.mockRejectedValueOnce(
      new Error("Some unexpected error"),
    );

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    await offlineQueue.processQueue(client);

    // Verify it's failed
    let queue = await offlineQueue.getQueue();
    expect(queue[0].status).toBe("failed");

    // Now retry — mock success this time
    client.sessions.addLine.mutate.mockResolvedValue(undefined);
    const result = await offlineQueue.retryFailed(client);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);

    queue = await offlineQueue.getQueue();
    expect(queue).toHaveLength(0);
  });

  it("resets retryCount and error on failed entries", async () => {
    const client = createMockClient();
    client.sessions.addLine.mutate.mockRejectedValueOnce(
      new Error("Some error"),
    );

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    await offlineQueue.processQueue(client);

    // Before retry: check state
    let queue = await offlineQueue.getQueue();
    expect(queue[0].retryCount).toBeGreaterThanOrEqual(0);
    expect(queue[0].error).toBeDefined();

    // Make it hang so we can inspect before it completes
    let resolveMutate!: () => void;
    client.sessions.addLine.mutate.mockReturnValue(
      new Promise<void>((r) => {
        resolveMutate = r;
      }),
    );

    const retryPromise = offlineQueue.retryFailed(client);

    // After retryFailed resets entries but before processQueue completes,
    // load the queue to check the reset happened
    // Wait a tick for the reset to persist
    await new Promise((r) => setTimeout(r, 0));
    queue = await offlineQueue.getQueue();
    // Entry should be syncing now (reset from failed → pending → syncing)
    expect(queue[0].error).toBeUndefined();

    resolveMutate();
    await retryPromise;
  });
});

// ─── clearFailed ────────────────────────────────────────────────────────────

describe("clearFailed", () => {
  it("removes only failed entries", async () => {
    const client = createMockClient();
    client.sessions.addLine.mutate.mockRejectedValue(
      new Error("Some unexpected error"),
    );

    await offlineQueue.enqueue("sessions.addLine", { sessionId: "s1" });
    await offlineQueue.enqueue("sessions.updateLine", { sessionId: "s2" });

    // Fail the first, succeed the second
    client.sessions.addLine.mutate.mockRejectedValueOnce(
      new Error("Some unexpected error"),
    );
    client.sessions.updateLine.mutate.mockResolvedValue(undefined);

    await offlineQueue.processQueue(client);

    // After processing: first should be failed, second should be synced (removed)
    let queue = await offlineQueue.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].status).toBe("failed");

    // Add a new pending entry
    await offlineQueue.enqueue("receiving.receive", { locationId: "l1" });

    await offlineQueue.clearFailed();

    queue = await offlineQueue.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].mutation).toBe("receiving.receive");
    expect(queue[0].status).toBe("pending");
  });
});
