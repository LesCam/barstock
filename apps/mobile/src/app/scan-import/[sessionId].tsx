import { useEffect, useRef } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { setPendingBridgeSession } from "./pending-bridge";

/**
 * Deep link handler for barstock://scan-import/{sessionId}
 * Stores the session ID in a shared ref, then navigates to scan-import.
 * Uses a module-level Set to prevent re-triggering on hot reloads.
 */
const handledSessions = new Set<string>();

export default function ScanImportDeepLink() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    if (sessionId && !handledSessions.has(sessionId)) {
      handledSessions.add(sessionId);
      setPendingBridgeSession(sessionId);
      router.replace("/scan-import");
    } else {
      // Already handled (reload) — go home instead of re-opening scan-import
      router.replace("/");
    }
  }, [sessionId]);

  return null;
}
