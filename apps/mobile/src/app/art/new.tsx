import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";
import { NumericKeypad } from "@/components/NumericKeypad";

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function CreateArtworkScreen() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Form state
  const [artistId, setArtistId] = useState<string | null>(null);
  const [artistName, setArtistName] = useState("");
  const [showArtistPicker, setShowArtistPicker] = useState(false);
  const [artistFilter, setArtistFilter] = useState("");

  const [title, setTitle] = useState("");
  const [priceCentsStr, setPriceCentsStr] = useState("");
  const [locationInPub, setLocationInPub] = useState("");
  const [medium, setMedium] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [notes, setNotes] = useState("");

  const priceCents = priceCentsStr ? parseInt(priceCentsStr, 10) : 0;

  // Artist list
  const { data: artistsData } = trpc.artists.list.useQuery(
    { businessId: user!.businessId, activeOnly: true, limit: 100 },
    { enabled: !!user?.businessId }
  );

  const filteredArtists = useMemo(() => {
    const artists = artistsData?.items ?? [];
    if (!artistFilter.trim()) return artists;
    const q = artistFilter.toLowerCase();
    return artists.filter((a: any) => a.name.toLowerCase().includes(q));
  }, [artistsData, artistFilter]);

  const createMutation = trpc.artworks.create.useMutation({
    onSuccess: (data) => {
      utils.artworks.list.invalidate();
      router.replace(`/art/${data.id}` as any);
    },
    onError: (err) => {
      Alert.alert("Error", err.message);
    },
  });

  function handleSubmit() {
    if (!artistId) {
      Alert.alert("Missing Artist", "Please select an artist.");
      return;
    }
    if (!title.trim()) {
      Alert.alert("Missing Title", "Please enter a title.");
      return;
    }
    if (priceCents <= 0) {
      Alert.alert("Missing Price", "Please enter a price.");
      return;
    }

    createMutation.mutate({
      businessId: user!.businessId,
      artistId,
      title: title.trim(),
      listPriceCents: priceCents,
      locationInPub: locationInPub.trim() || undefined,
      medium: medium.trim() || undefined,
      dimensions: dimensions.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  }

  // Artist picker overlay
  if (showArtistPicker) {
    return (
      <View style={styles.container}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>Select Artist</Text>
          <TouchableOpacity onPress={() => setShowArtistPicker(false)}>
            <Text style={styles.pickerCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.pickerSearch}
          placeholder="Filter artists..."
          placeholderTextColor="#5A6A7A"
          value={artistFilter}
          onChangeText={setArtistFilter}
          autoFocus
        />
        <FlatList
          data={filteredArtists}
          keyExtractor={(item: any) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }: { item: any }) => (
            <TouchableOpacity
              style={styles.pickerItem}
              onPress={() => {
                setArtistId(item.id);
                setArtistName(item.name);
                setArtistFilter("");
                setShowArtistPicker(false);
              }}
            >
              <Text style={styles.pickerItemText}>{item.name}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.pickerEmpty}>No artists found.</Text>
          }
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {/* Artist */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Artist *</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowArtistPicker(true)}
          >
            <Text
              style={[
                styles.pickerButtonText,
                !artistName && styles.pickerButtonPlaceholder,
              ]}
            >
              {artistName || "Select artist..."}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Title */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="Artwork title"
            placeholderTextColor="#5A6A7A"
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Price */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Price *</Text>
          <Text style={styles.priceDisplay}>{formatPrice(priceCents)}</Text>
          <NumericKeypad
            value={priceCentsStr}
            onChange={setPriceCentsStr}
            maxLength={8}
          />
        </View>

        {/* Location */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Location in Pub</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. South wall, near bar"
            placeholderTextColor="#5A6A7A"
            value={locationInPub}
            onChangeText={setLocationInPub}
          />
        </View>

        {/* Medium */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Medium</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Oil on canvas"
            placeholderTextColor="#5A6A7A"
            value={medium}
            onChangeText={setMedium}
          />
        </View>

        {/* Dimensions */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Dimensions</Text>
          <TextInput
            style={styles.input}
            placeholder='e.g. 24" x 36"'
            placeholderTextColor="#5A6A7A"
            value={dimensions}
            onChangeText={setDimensions}
          />
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="Additional notes"
            placeholderTextColor="#5A6A7A"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            createMutation.isPending && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={createMutation.isPending}
          activeOpacity={0.7}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color="#0B1623" />
          ) : (
            <Text style={styles.submitButtonText}>Create Artwork</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1623" },
  content: { padding: 16, paddingBottom: 40 },
  section: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8899AA",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#16283F",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#EAF0FF",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  notesInput: { minHeight: 60, textAlignVertical: "top" },
  priceDisplay: {
    fontSize: 36,
    fontWeight: "700",
    color: "#E9B44C",
    textAlign: "center",
    marginBottom: 12,
  },
  pickerButton: {
    backgroundColor: "#16283F",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  pickerButtonText: {
    fontSize: 15,
    color: "#EAF0FF",
  },
  pickerButtonPlaceholder: {
    color: "#5A6A7A",
  },
  // Artist picker overlay
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#EAF0FF",
  },
  pickerCancel: {
    fontSize: 15,
    color: "#E9B44C",
    fontWeight: "600",
  },
  pickerSearch: {
    backgroundColor: "#16283F",
    margin: 16,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#EAF0FF",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  pickerItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E3550",
  },
  pickerItemText: {
    fontSize: 16,
    color: "#EAF0FF",
  },
  pickerEmpty: {
    textAlign: "center",
    color: "#5A6A7A",
    marginTop: 40,
    fontSize: 14,
  },
  submitButton: {
    backgroundColor: "#E9B44C",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { fontSize: 17, fontWeight: "700", color: "#0B1623" },
});
