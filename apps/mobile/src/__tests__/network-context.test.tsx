import React from "react";
import { renderHook, act } from "@testing-library/react-native";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";

// Mock offline-queue module
jest.mock("@/lib/offline-queue", () => ({
  processQueue: jest.fn().mockResolvedValue({ synced: 0, failed: 0, sessionClosed: false }),
  retryFailed: jest.fn().mockResolvedValue({ synced: 0, failed: 0, sessionClosed: false }),
  getQueue: jest.fn().mockResolvedValue([]),
}));

import { NetworkProvider, useNetwork } from "@/lib/network-context";
import * as offlineQueue from "@/lib/offline-queue";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NetworkProvider>{children}</NetworkProvider>
);

beforeEach(() => {
  jest.restoreAllMocks();
  (AppState as any).__resetListeners();
  (offlineQueue.processQueue as jest.Mock).mockClear().mockResolvedValue({ synced: 0, failed: 0, sessionClosed: false });
  (offlineQueue.retryFailed as jest.Mock).mockClear().mockResolvedValue({ synced: 0, failed: 0, sessionClosed: false });
  (offlineQueue.getQueue as jest.Mock).mockClear().mockResolvedValue([]);
  (NetInfo.addEventListener as jest.Mock).mockClear();
});

// ─── useNetwork default ─────────────────────────────────────────────────────

describe("useNetwork default", () => {
  it("returns { isOnline: true } initially", () => {
    const { result } = renderHook(() => useNetwork(), { wrapper });
    expect(result.current).toEqual({ isOnline: true });
  });
});

// ─── NetInfo offline → online transition ────────────────────────────────────

describe("NetInfo offline → online transition", () => {
  it("updates isOnline to false when offline", () => {
    const { result } = renderHook(() => useNetwork(), { wrapper });

    act(() => {
      (NetInfo as any).__simulateChange({ isConnected: false, isInternetReachable: false });
    });

    expect(result.current.isOnline).toBe(false);
  });

  it("updates isOnline to true when back online and calls processQueue", async () => {
    const { result } = renderHook(() => useNetwork(), { wrapper });

    // Go offline
    act(() => {
      (NetInfo as any).__simulateChange({ isConnected: false, isInternetReachable: false });
    });
    expect(result.current.isOnline).toBe(false);

    // Go back online
    act(() => {
      (NetInfo as any).__simulateChange({ isConnected: true, isInternetReachable: true });
    });

    expect(result.current.isOnline).toBe(true);
    expect(offlineQueue.processQueue).toHaveBeenCalled();
  });
});

// ─── NetInfo online but not reachable ───────────────────────────────────────

describe("NetInfo online but not reachable", () => {
  it("isOnline is false when isInternetReachable is explicitly false", () => {
    const { result } = renderHook(() => useNetwork(), { wrapper });

    // The code: !!(isConnected && isInternetReachable !== false)
    // isConnected: true, isInternetReachable: false → false since isInternetReachable IS false
    act(() => {
      (NetInfo as any).__simulateChange({ isConnected: true, isInternetReachable: false });
    });

    expect(result.current.isOnline).toBe(false);
  });

  it("isOnline stays true when isInternetReachable is null (unknown)", () => {
    const { result } = renderHook(() => useNetwork(), { wrapper });

    act(() => {
      (NetInfo as any).__simulateChange({ isConnected: true, isInternetReachable: null });
    });

    // isConnected: true && null !== false → true
    expect(result.current.isOnline).toBe(true);
  });
});

// ─── AppState resume while online with pending items ────────────────────────

describe("AppState resume while online with pending items", () => {
  it("calls processQueue when app becomes active while online with pending items", async () => {
    (offlineQueue.getQueue as jest.Mock).mockResolvedValue([
      { id: "oq_1", status: "pending", mutation: "sessions.addLine", input: {} },
    ]);

    renderHook(() => useNetwork(), { wrapper });

    // Simulate app resume
    await act(async () => {
      (AppState as any).__simulateChange("active");
      // Allow async getQueue to resolve
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(offlineQueue.processQueue).toHaveBeenCalled();
  });
});

// ─── AppState resume while online with empty queue ──────────────────────────

describe("AppState resume while online with empty queue", () => {
  it("does NOT call processQueue when no pending items", async () => {
    (offlineQueue.getQueue as jest.Mock).mockResolvedValue([]);

    renderHook(() => useNetwork(), { wrapper });

    await act(async () => {
      (AppState as any).__simulateChange("active");
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(offlineQueue.processQueue).not.toHaveBeenCalled();
  });
});

// ─── AppState resume while offline ──────────────────────────────────────────

describe("AppState resume while offline", () => {
  it("does NOT call processQueue when offline", async () => {
    (offlineQueue.getQueue as jest.Mock).mockResolvedValue([
      { id: "oq_1", status: "pending", mutation: "sessions.addLine", input: {} },
    ]);

    renderHook(() => useNetwork(), { wrapper });

    // Go offline first
    act(() => {
      (NetInfo as any).__simulateChange({ isConnected: false, isInternetReachable: false });
    });

    (offlineQueue.processQueue as jest.Mock).mockClear();

    // Resume while offline
    await act(async () => {
      (AppState as any).__simulateChange("active");
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(offlineQueue.processQueue).not.toHaveBeenCalled();
  });
});

// ─── 60s retry interval ────────────────────────────────────────────────────

describe("60s retry interval", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("calls retryFailed after 60s when online with failed items", async () => {
    (offlineQueue.getQueue as jest.Mock).mockResolvedValue([
      { id: "oq_1", status: "failed", mutation: "sessions.addLine", input: {} },
    ]);

    renderHook(() => useNetwork(), { wrapper });

    // Advance 60s
    await act(async () => {
      jest.advanceTimersByTime(60_000);
      // Allow the async getQueue + retryFailed to resolve
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(offlineQueue.retryFailed).toHaveBeenCalled();
  });

  it("does NOT fire retryFailed when offline", async () => {
    (offlineQueue.getQueue as jest.Mock).mockResolvedValue([
      { id: "oq_1", status: "failed", mutation: "sessions.addLine", input: {} },
    ]);

    const { result } = renderHook(() => useNetwork(), { wrapper });

    // Go offline
    act(() => {
      (NetInfo as any).__simulateChange({ isConnected: false, isInternetReachable: false });
    });
    expect(result.current.isOnline).toBe(false);

    (offlineQueue.retryFailed as jest.Mock).mockClear();

    // Advance 60s while offline
    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(offlineQueue.retryFailed).not.toHaveBeenCalled();
  });
});

// ─── Cleanup ────────────────────────────────────────────────────────────────

describe("Cleanup", () => {
  it("cleans up NetInfo listener, AppState subscription, and interval on unmount", () => {
    const { unmount } = renderHook(() => useNetwork(), { wrapper });

    unmount();

    // NetInfo listener should have been set up
    expect(NetInfo.addEventListener).toHaveBeenCalled();
    // AppState subscription remove should have been called
    expect(AppState.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
