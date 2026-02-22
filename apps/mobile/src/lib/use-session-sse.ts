import { useEffect, useRef, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { API_URL, getAuthToken } from "./trpc";

export interface SSEEvent {
  type: string;
  payload?: Record<string, unknown>;
}

/**
 * SSE client hook for mobile session real-time updates.
 * Uses streaming fetch (RN 0.81.5+) since EventSource doesn't support custom headers.
 */
export function useSessionSSE(
  sessionId: string | undefined,
  isOpen: boolean,
  onEvent: (event: SSEEvent) => void,
) {
  const abortRef = useRef<AbortController | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (!sessionId) return;

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

        if (!response.ok || !response.body) return;

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
      }

      // Stream ended or errored — reconnect after 5s
      if (!abortRef.current?.signal.aborted) {
        reconnectTimerRef.current = setTimeout(connect, 5000);
      }
    })();
  }, [sessionId]);

  // Connect/disconnect based on session state
  useEffect(() => {
    if (!sessionId || !isOpen) {
      abortRef.current?.abort();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      return;
    }

    connect();

    return () => {
      abortRef.current?.abort();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [sessionId, isOpen, connect]);

  // Disconnect on background, reconnect on foreground
  useEffect(() => {
    if (!sessionId || !isOpen) return;

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
  }, [sessionId, isOpen, connect]);
}
