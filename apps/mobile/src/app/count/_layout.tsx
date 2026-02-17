import { Stack } from "expo-router";

export default function CountLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0B1623" },
        headerTintColor: "#EAF0FF",
        headerTitleStyle: { fontWeight: "600" },
      }}
    >
      <Stack.Screen name="new" options={{ title: "Start Inventory Count" }} />
    </Stack>
  );
}
