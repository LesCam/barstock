import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { signIn } = useAuth();

  const login = trpc.auth.login.useMutation({
    async onSuccess(data) {
      try {
        await signIn(data.accessToken, data.refreshToken);
      } catch (e: any) {
        Alert.alert("Login Failed", e.message ?? "Could not fetch user profile");
      }
    },
    onError(error) {
      Alert.alert("Login Failed", error.message);
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BarStock</Text>
      <Text style={styles.subtitle}>Sign in to your account</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity
        style={styles.button}
        onPress={() => login.mutate({ email, password })}
        disabled={login.isPending}
      >
        <Text style={styles.buttonText}>
          {login.isPending ? "Signing in..." : "Sign In"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 28, fontWeight: "bold", textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 32 },
  input: {
    borderWidth: 1, borderColor: "#ddd", borderRadius: 8,
    padding: 14, marginBottom: 12, fontSize: 16,
  },
  button: {
    backgroundColor: "#2563eb", borderRadius: 8,
    padding: 14, alignItems: "center", marginTop: 8,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
