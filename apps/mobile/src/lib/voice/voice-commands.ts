export interface ScaleProfile {
  id: string;
  name: string;
}

export interface VoiceCommandResult {
  action: "connect-scale";
  profileId: string | null;
}

export function parseVoiceCommand(
  transcript: string,
  profiles: ScaleProfile[],
): VoiceCommandResult | null {
  const text = transcript.toLowerCase().trim();

  // Must contain both "connect" and "scale"
  if (!text.includes("connect") || !text.includes("scale")) {
    return null;
  }

  // Try to match a profile name in the transcript
  for (const profile of profiles) {
    if (text.includes(profile.name.toLowerCase())) {
      return { action: "connect-scale", profileId: profile.id };
    }
  }

  // No specific name — auto-select if only one profile
  if (profiles.length === 1) {
    return { action: "connect-scale", profileId: profiles[0].id };
  }

  // Multiple profiles, none matched
  return { action: "connect-scale", profileId: null };
}
