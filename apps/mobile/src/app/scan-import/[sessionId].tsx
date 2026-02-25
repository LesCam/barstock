import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { setPendingBridgeSession } from "./pending-bridge";

/**
 * Deep link handler for barstock://scan-import/{sessionId}
 * Stores the session ID in a shared ref, then navigates to scan-import.
 */
export default function ScanImportDeepLink() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  useEffect(() => {
    if (sessionId) {
      setPendingBridgeSession(sessionId);
    }
    router.replace("/scan-import");
  }, [sessionId]);

  return null;
}
