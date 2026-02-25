import { useEffect, useRef } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { setPendingBridgeSession } from "./pending-bridge";

/**
 * Deep link handler for barstock://scan-import/{sessionId}
 * Stores the session ID in a shared ref, then navigates to scan-import.
 * On reload (route restoration), redirects to home instead.
 */
export default function ScanImportDeepLink() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    // Check if we arrived via an actual deep link vs route restoration on reload
    Linking.getInitialURL().then((url) => {
      if (url && sessionId && url.includes("scan-import")) {
        // Genuine deep link — set bridge and go to scan-import
        setPendingBridgeSession(sessionId);
        router.replace("/scan-import");
      } else {
        // Route restored on reload — go home
        router.replace("/(tabs)");
      }
    });
  }, [sessionId]);

  return null;
}
