import "@/lib/polyfills";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc, trpcClient } from "@/lib/trpc";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { NotificationProvider } from "@/lib/notification-context";
import { LockProvider, useLock } from "@/lib/lock-context";
import { CountingPreferencesProvider } from "@/lib/counting-preferences";
import { NetworkProvider } from "@/lib/network-context";
import { OfflineBanner } from "@/components/OfflineBanner";
import LockScreen from "@/components/LockScreen";
import OnboardingOverlay from "@/components/OnboardingOverlay";

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "@barstock/queryCache",
});

function RootNavigator() {
  const { token, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!token && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (token && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [token, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0B1623" },
        headerTintColor: "#EAF0FF",
        headerTitleStyle: { fontWeight: "600" },
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="count" options={{ headerShown: false }} />
      <Stack.Screen
        name="session/[id]/index"
        options={{ title: "Session", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="session/[id]/packaged"
        options={{ title: "Packaged Count", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="session/[id]/liquor"
        options={{ title: "Liquor Weigh", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="session/[id]/draft"
        options={{ title: "Draft Verify", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="session/[id]/connect-scale"
        options={{ title: "Connect Scale", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="connect-scale"
        options={{ title: "Connect Scale", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="tare-weights"
        options={{ title: "Tare Weights", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="manage-items"
        options={{ title: "Manage Items", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="inventory/[id]"
        options={{ title: "Item Detail", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="transfer"
        options={{ title: "Transfer Items", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="receive"
        options={{ title: "Receive Stock", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="par-levels"
        options={{ title: "Par Levels", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="shopping-list"
        options={{ title: "Shopping List", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="guide/[id]"
        options={{ title: "Product Info", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="art/[id]"
        options={{ title: "Artwork", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="art/new"
        options={{ title: "New Artwork", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="art/photo"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="art/sell"
        options={{ title: "Record Sale", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="notifications"
        options={{ title: "Notifications", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="audit-log"
        options={{ title: "Audit Log", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="alert-settings"
        options={{ title: "Alert Settings", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="help"
        options={{ title: "Help", headerBackTitle: "Back" }}
      />
    </Stack>
  );
}

function LockOverlay() {
  const { isLocked } = useLock();
  const { token } = useAuth();

  if (!isLocked || !token) return null;
  return <LockScreen />;
}

function OnboardingGate() {
  const { token, user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!token) return;
    AsyncStorage.getItem("@barstock/onboardingComplete").then((val) => {
      setShowOnboarding(val !== "true");
      setChecked(true);
    });
  }, [token]);

  if (!checked || !showOnboarding || !token) return null;
  return (
    <OnboardingOverlay
      user={user}
      onComplete={() => {
        AsyncStorage.setItem("@barstock/onboardingComplete", "true");
        setShowOnboarding(false);
      }}
    />
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 1000 * 60 * 60 * 24, // 24h — keep cache for offline persistence
          },
        },
      })
  );

  const persistOptions = {
    persister: asyncStoragePersister,
    dehydrateOptions: {
      shouldDehydrateQuery: (query: any) => {
        // Only persist session, inventory, and area queries — not auth
        const key = query.queryKey?.[0]?.[0] ?? "";
        return (
          key === "sessions" ||
          key === "inventory" ||
          key === "areas" ||
          key === "scale" ||
          key === "draft"
        );
      },
    },
  };

  return (
    <NetworkProvider>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={persistOptions}
        >
          <AuthProvider>
            <NotificationProvider>
              <CountingPreferencesProvider>
                <LockProvider>
                  <OfflineBanner />
                  <RootNavigator />
                  <LockOverlay />
                  <OnboardingGate />
                </LockProvider>
              </CountingPreferencesProvider>
            </NotificationProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </trpc.Provider>
    </NetworkProvider>
  );
}
