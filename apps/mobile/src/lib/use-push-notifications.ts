import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { trpcVanilla } from "./trpc";
import { mapNotificationRoute } from "./notification-route-map";

let Notifications: typeof import("expo-notifications") | null = null;
try {
  Notifications = require("expo-notifications");
} catch {
  // Native module not available — skip push
}

// Show notifications while app is foregrounded
try {
  Notifications?.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  // ignore
}

let registeredToken: string | null = null;

export async function unregisterPushToken(): Promise<void> {
  if (!registeredToken) return;
  try {
    await trpcVanilla.notifications.unregisterPushToken.mutate({
      token: registeredToken,
    });
  } catch {
    // best-effort
  }
  registeredToken = null;
}

export function usePushNotifications(isAuthenticated: boolean) {
  const router = useRouter();
  const responseListener = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !Notifications) return;

    (async () => {
      try {
        const { status: existingStatus } =
          await Notifications!.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
          const { status } = await Notifications!.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== "granted") return;

        const tokenData = await Notifications!.getExpoPushTokenAsync({
          projectId: "52eb4767-125b-40a0-9c2c-d28e99abcc9f",
        });
        const token = tokenData.data;
        registeredToken = token;

        await trpcVanilla.notifications.registerPushToken.mutate({
          token,
          platform: Platform.OS as "ios" | "android",
        });
      } catch {
        // Token registration failed — non-critical
      }
    })();

    // Handle notification taps
    try {
      responseListener.current =
        Notifications!.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data;
          const linkUrl = data?.linkUrl as string | undefined;
          const notificationId = data?.notificationId as string | undefined;

          if (notificationId) {
            trpcVanilla.notifications.markRead
              .mutate({ id: notificationId })
              .catch(() => {});
          }

          const route = mapNotificationRoute(linkUrl);
          if (route) {
            router.push(route as any);
          }
        });
    } catch {
      // listener setup failed — non-critical
    }

    return () => {
      if (responseListener.current) {
        try {
          responseListener.current.remove();
        } catch {
          // ignore
        }
        responseListener.current = null;
      }
    };
  }, [isAuthenticated]);
}
