import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "scaleMappings";

interface ScaleMapping {
  profileId: string;
  profileName: string;
}

type MappingsMap = Record<string, ScaleMapping>; // { [bleDeviceId]: { profileId, profileName } }

async function loadMappings(): Promise<MappingsMap> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    // Migrate old format: { [bleDeviceId]: "profileId" } → new format
    const result: MappingsMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        // Old format — profileId only, name unknown
        result[key] = { profileId: value, profileName: "" };
      } else if (value && typeof value === "object" && "profileId" in value) {
        result[key] = value as ScaleMapping;
      }
    }
    return result;
  } catch {
    return {};
  }
}

async function saveMappings(mappings: MappingsMap): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
}

export async function getMappingForDevice(bleDeviceId: string): Promise<ScaleMapping | null> {
  const mappings = await loadMappings();
  return mappings[bleDeviceId] ?? null;
}

export async function setMappingForDevice(
  bleDeviceId: string,
  profileId: string,
  profileName: string
): Promise<void> {
  const mappings = await loadMappings();
  mappings[bleDeviceId] = { profileId, profileName };
  await saveMappings(mappings);
}

export async function clearMappingForDevice(bleDeviceId: string): Promise<void> {
  const mappings = await loadMappings();
  delete mappings[bleDeviceId];
  await saveMappings(mappings);
}

export async function getAllMappings(): Promise<MappingsMap> {
  return loadMappings();
}
