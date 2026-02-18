import { Stack, router } from "expo-router";
import { TouchableOpacity, Text } from "react-native";

export default function CountLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0B1623" },
        headerTintColor: "#EAF0FF",
        headerTitleStyle: { fontWeight: "600" },
      }}
    >
      <Stack.Screen
        name="new"
        options={{
          title: "Start Inventory Count",
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={{ color: "#EAF0FF", fontSize: 16 }}>‹ Back</Text>
            </TouchableOpacity>
          ),
        }}
      />
    </Stack>
  );
}
