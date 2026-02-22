import { useEffect } from "react";
import { useLocalSearchParams, router } from "expo-router";

/**
 * Redirect from /artwork/[id] (QR code deep link) to /art/[id] (staff detail screen).
 * When staff scan a wall-label QR code and the app intercepts the link,
 * this route forwards them to the authenticated artwork detail view.
 */
export default function ArtworkRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();

  useEffect(() => {
    if (id) {
      router.replace(`/art/${id}` as any);
    }
  }, [id]);

  return null;
}
