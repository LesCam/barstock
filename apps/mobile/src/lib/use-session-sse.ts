import { useEffect, useRef, useCallback, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { API_URL, getAuthToken } from "./trpc";

export interface SSEEvent {
  type: string;
  payload?: Record<string, unknown>;
}

export type SSEMode = "streaming" | "degraded";

const MAX_FAILURES_BEFORE_DEGRADED = 3;
const DEGRADED_RECONNECT_MS = 60_000;
const NORMAL_RECONNECT_MS = 5_000;

/**
 * SSE client hook for mobile session real-time updates.
 * Uses streaming fetch (RN 0.81.5+) since EventSource doesn't support custom headers.
 *
 * After 3 consecutive connection failures, enters "degraded" mode:
 * - Reconnect interval slows to 60s
 * - Consumers should speed up polling as a fallback
 * On successful connection, resets to "streaming" mode.
 */
export function useSessionSSE(
  sessionId: string | undefined,
  isOpen: boolean,
  onEvent: (event: SSEEvent) => void,
  isOnline: boolean = true,
) {
  const abortRef = useRef<AbortController | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const failCountRef = useRef(0);
  const [mode, setMode] = useState<SSEMode>("streaming");

  // Reset failure state when coming back online
  useEffect(() => {
    if (isOnline) {
      failCountRef.current = 0;
      setMode("streaming");
    }
  }, [isOnline]);

  const connect = useCallback(() => {
    if (!sessionId || !isOnline) return;

    const token = getAuthToken();
    if (!token) return;

    // Clean up previous connection
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const url = `${API_URL}/api/sessions/${sessionId}/stream`;

    (async () => {
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortRef.current!.signal,
        });

        if (!response.ok || !response.body) {
          // Non-OK response counts as a failure
          failCountRef.current++;
          if (failCountRef.current >= MAX_FAILURES_BEFORE_DEGRADED) {
            setMode("degraded");
          }
          if (!abortRef.current?.signal.aborted && isOnline) {
            const delay = failCountRef.current >= MAX_FAILURES_BEFORE_DEGRADED
              ? DEGRADED_RECONNECT_MS
              : NORMAL_RECONNECT_MS;
            reconnectTimerRef.current = setTimeout(connect, delay);
          }
          return;
        }

        // Connection succeeded — reset failure tracking
        failCountRef.current = 0;
        setMode("streaming");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE format: "data: {...}\n\n"
          const parts = buffer.split("\n\n");
          // Keep the last incomplete chunk in the buffer
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6)) as SSEEvent;
              if (data.type === "heartbeat") continue;
              onEventRef.current(data);
            } catch {
              // Ignore parse errors
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        // Connection error — increment failure count
        failCountRef.current++;
        if (failCountRef.current >= MAX_FAILURES_BEFORE_DEGRADED) {
          setMode("degraded");
        }
      }

      // Stream ended or errored — reconnect (only if online)
      if (!abortRef.current?.signal.aborted && isOnline) {
        const delay = failCountRef.current >= MAX_FAILURES_BEFORE_DEGRADED
          ? DEGRADED_RECONNECT_MS
          : NORMAL_RECONNECT_MS;
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    })();
  }, [sessionId, isOnline]);

  // Connect/disconnect based on session state and network
  useEffect(() => {
    if (!sessionId || !isOpen || !isOnline) {
      abortRef.current?.abort();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      return;
    }

    connect();

    return () => {
      abortRef.current?.abort();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [sessionId, isOpen, isOnline, connect]);

  // Disconnect on background, reconnect on foreground
  useEffect(() => {
    if (!sessionId || !isOpen || !isOnline) return;

    const handleAppState = (state: AppStateStatus) => {
      if (state === "active") {
        connect();
      } else {
        abortRef.current?.abort();
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      }
    };

    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [sessionId, isOpen, isOnline, connect]);

  return { mode };
}
