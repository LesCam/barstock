import { useEffect, useRef } from "react";
import { scaleManager } from "./scale-manager";
import { trpc } from "../trpc";

const HEARTBEAT_INTERVAL_MS = 30_000;

export function useScaleHeartbeat(profileId: string | null) {
  const heartbeatMutation = trpc.scaleProfiles.heartbeat.useMutation();
  const profileIdRef = useRef(profileId);
  profileIdRef.current = profileId;

  useEffect(() => {
    if (!profileId) return;

    function sendHeartbeat() {
      if (!profileIdRef.current || !scaleManager.isConnected) return;
      heartbeatMutation.mutate({
        profileId: profileIdRef.current,
        batteryLevel: scaleManager.batteryLevel ?? undefined,
      });
    }

    // Send immediately on start
    sendHeartbeat();

    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [profileId]);
}
