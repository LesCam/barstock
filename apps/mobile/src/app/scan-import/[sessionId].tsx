import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";

/**
 * Deep link handler for barstock://scan-import/{sessionId}
 * Redirects to the main scan-import screen with the session ID as a query param
 * so it can auto-pair with the web bridge.
 */
export default function ScanImportDeepLink() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  useEffect(() => {
    router.replace({ pathname: "/scan-import", params: { bridgeSession: sessionId } });
  }, [sessionId]);

  return null;
}
