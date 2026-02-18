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

const PAYOUT_METHODS = [
  { label: "E-Transfer", value: "etransfer" },
  { label: "Cheque", value: "cheque" },
  { label: "Cash", value: "cash" },
  { label: "Other", value: "other" },
  { label: "None", value: "none" },
] as const;

const NO_PAYOUT_REASONS = [
  "Artist agreed",
  "Donation",
  "Display only",
] as const;

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
  const [showNewArtistForm, setShowNewArtistForm] = useState(false);

  // New artist form state
  const [newArtistName, setNewArtistName] = useState("");
  const [newArtistEmail, setNewArtistEmail] = useState("");
  const [newArtistPhone, setNewArtistPhone] = useState("");
  const [newArtistPayout, setNewArtistPayout] = useState<string>("etransfer");
  const [newArtistNoPayoutReason, setNewArtistNoPayoutReason] = useState<string>("Artist agreed");
  const [newArtistBio, setNewArtistBio] = useState("");
  const [newArtistNotes, setNewArtistNotes] = useState("");

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

  // Show "create new" when filter text doesn't exactly match any existing artist
  const showCreateNew = useMemo(() => {
    if (!artistFilter.trim()) return false;
    const q = artistFilter.trim().toLowerCase();
    const artists = artistsData?.items ?? [];
    return !artists.some((a: any) => a.name.toLowerCase() === q);
  }, [artistsData, artistFilter]);

  function resetNewArtistForm() {
    setNewArtistName("");
    setNewArtistEmail("");
    setNewArtistPhone("");
    setNewArtistPayout("etransfer");
    setNewArtistNoPayoutReason("Artist agreed");
    setNewArtistBio("");
    setNewArtistNotes("");
  }

  const createArtist = trpc.artists.create.useMutation({
    onSuccess: (data: any) => {
      setArtistId(data.id);
      setArtistName(data.name);
      setArtistFilter("");
      setShowArtistPicker(false);
      setShowNewArtistForm(false);
      resetNewArtistForm();
      utils.artists.list.invalidate();
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message);
    },
  });

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

  // New artist form overlay
  if (showNewArtistForm) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>New Artist</Text>
          <TouchableOpacity
            onPress={() => {
              setShowNewArtistForm(false);
              resetNewArtistForm();
            }}
          >
            <Text style={styles.pickerCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Artist name"
              placeholderTextColor="#5A6A7A"
              value={newArtistName}
              onChangeText={setNewArtistName}
              autoFocus
            />
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="artist@email.com"
              placeholderTextColor="#5A6A7A"
              value={newArtistEmail}
              onChangeText={setNewArtistEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Phone</Text>
            <TextInput
              style={styles.input}
              placeholder="Phone number"
              placeholderTextColor="#5A6A7A"
              value={newArtistPhone}
              onChangeText={setNewArtistPhone}
              keyboardType="phone-pad"
            />
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Payout Method</Text>
            <View style={styles.payoutPills}>
              {PAYOUT_METHODS.map((pm) => (
                <TouchableOpacity
                  key={pm.value}
                  style={[
                    styles.payoutPill,
                    newArtistPayout === pm.value && styles.payoutPillActive,
                  ]}
                  onPress={() => setNewArtistPayout(pm.value)}
                >
                  <Text
                    style={[
                      styles.payoutPillText,
                      newArtistPayout === pm.value && styles.payoutPillTextActive,
                    ]}
                  >
                    {pm.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {newArtistPayout === "none" && (
              <View style={styles.reasonPills}>
                {NO_PAYOUT_REASONS.map((reason) => (
                  <TouchableOpacity
                    key={reason}
                    style={[
                      styles.payoutPill,
                      newArtistNoPayoutReason === reason && styles.payoutPillActive,
                    ]}
                    onPress={() => setNewArtistNoPayoutReason(reason)}
                  >
                    <Text
                      style={[
                        styles.payoutPillText,
                        newArtistNoPayoutReason === reason && styles.payoutPillTextActive,
                      ]}
                    >
                      {reason}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Bio</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              placeholder="Artist bio"
              placeholderTextColor="#5A6A7A"
              value={newArtistBio}
              onChangeText={setNewArtistBio}
              multiline
            />
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              placeholder="Internal notes"
              placeholderTextColor="#5A6A7A"
              value={newArtistNotes}
              onChangeText={setNewArtistNotes}
              multiline
            />
          </View>
          <TouchableOpacity
            style={[
              styles.submitButton,
              createArtist.isPending && styles.submitButtonDisabled,
            ]}
            disabled={createArtist.isPending || !newArtistName.trim()}
            onPress={() => {
              const isNoPayout = newArtistPayout === "none";
              const noteParts = [
                isNoPayout ? `No payout: ${newArtistNoPayoutReason}` : "",
                newArtistNotes.trim(),
              ].filter(Boolean).join("\n");

              createArtist.mutate({
                businessId: user!.businessId,
                name: newArtistName.trim(),
                contactEmail: newArtistEmail.trim() || undefined,
                contactPhone: newArtistPhone.trim() || undefined,
                payoutMethod: isNoPayout ? undefined : (newArtistPayout as any),
                bio: newArtistBio.trim() || undefined,
                notes: noteParts || undefined,
              });
            }}
            activeOpacity={0.7}
          >
            {createArtist.isPending ? (
              <ActivityIndicator color="#0B1623" />
            ) : (
              <Text style={styles.submitButtonText}>Create Artist</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
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
          placeholder="Search or type new name..."
          placeholderTextColor="#5A6A7A"
          value={artistFilter}
          onChangeText={setArtistFilter}
          autoFocus
        />
        {showCreateNew && (
          <TouchableOpacity
            style={styles.createNewItem}
            onPress={() => {
              setNewArtistName(artistFilter.trim());
              setShowNewArtistForm(true);
            }}
          >
            <Text style={styles.createNewPlus}>+</Text>
            <Text style={styles.createNewText}>
              Create "{artistFilter.trim()}"
            </Text>
          </TouchableOpacity>
        )}
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
  createNewItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#1E3550",
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  createNewPlus: {
    fontSize: 18,
    fontWeight: "700",
    color: "#E9B44C",
    marginRight: 8,
  },
  createNewText: {
    fontSize: 15,
    color: "#E9B44C",
    fontWeight: "600",
  },
  payoutPills: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  payoutPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#16283F",
    borderWidth: 1,
    borderColor: "#1E3550",
  },
  payoutPillActive: {
    backgroundColor: "#E9B44C",
    borderColor: "#E9B44C",
  },
  payoutPillText: { fontSize: 14, fontWeight: "500", color: "#EAF0FF" },
  payoutPillTextActive: { color: "#0B1623" },
  reasonPills: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 10,
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
