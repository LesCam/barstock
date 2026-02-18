import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "scaleMappings";

type MappingsMap = Record<string, string>; // { [bleDeviceId]: profileId }

async function loadMappings(): Promise<MappingsMap> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveMappings(mappings: MappingsMap): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
}

export async function getProfileForDevice(bleDeviceId: string): Promise<string | null> {
  const mappings = await loadMappings();
  return mappings[bleDeviceId] ?? null;
}

export async function setProfileForDevice(bleDeviceId: string, profileId: string): Promise<void> {
  const mappings = await loadMappings();
  mappings[bleDeviceId] = profileId;
  await saveMappings(mappings);
}

export async function clearProfileForDevice(bleDeviceId: string): Promise<void> {
  const mappings = await loadMappings();
  delete mappings[bleDeviceId];
  await saveMappings(mappings);
}

export async function getAllMappings(): Promise<MappingsMap> {
  return loadMappings();
}
