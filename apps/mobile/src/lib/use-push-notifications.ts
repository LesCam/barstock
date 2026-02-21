import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import type { EventSubscription } from "expo-modules-core";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { trpcVanilla } from "./trpc";
import { mapNotificationRoute } from "./notification-route-map";

// Show notifications while app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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
  const responseListener = useRef<EventSubscription | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    (async () => {
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") return;

      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({
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
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        const linkUrl = data?.linkUrl as string | undefined;
        const notificationId = data?.notificationId as string | undefined;

        // Mark as read
        if (notificationId) {
          trpcVanilla.notifications.markRead
            .mutate({ id: notificationId })
            .catch(() => {});
        }

        // Navigate to the right screen
        const route = mapNotificationRoute(linkUrl);
        if (route) {
          router.push(route as any);
        }
      });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
        responseListener.current = null;
      }
    };
  }, [isAuthenticated]);
}
