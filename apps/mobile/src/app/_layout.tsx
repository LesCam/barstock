import "@/lib/polyfills";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, trpcClient } from "@/lib/trpc";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LockProvider, useLock } from "@/lib/lock-context";
import LockScreen from "@/components/LockScreen";

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
    </Stack>
  );
}

function LockOverlay() {
  const { isLocked } = useLock();
  const { token } = useAuth();

  if (!isLocked || !token) return null;
  return <LockScreen />;
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
          },
        },
      })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LockProvider>
            <RootNavigator />
            <LockOverlay />
          </LockProvider>
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
