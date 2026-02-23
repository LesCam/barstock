// ── Types ──────────────────────────────────────────────────────────────

export interface VoiceContext {
  scaleProfiles: Array<{ id: string; name: string }>;
  inventoryItems: Array<{ id: string; name: string }>;
  subAreas: Array<{ id: string; label: string }>; // "Bar — Well" format
}

export type VoiceCommandResult =
  | { action: "connect-scale"; profileId: string | null }
  | {
      action: "transfer";
      itemId: string | null;
      itemName: string | null;
      quantity: number | null;
      fromSubAreaId: string | null;
      toSubAreaId: string | null;
    }
  | {
      action: "receive";
      itemId: string | null;
      itemName: string | null;
      quantity: number | null;
    }
  | {
      action: "add-item";
      itemId: string | null;
      itemName: string | null;
      quantity: number | null;
    }
  | { action: "navigate"; screen: string }
  | { action: "stop-listening" };

// ── Tens words (twenty → ninety) ──────────────────────────────────────

const TENS_WORDS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

// ── Number word map (one → twenty) ────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

// ── Navigation screen map ─────────────────────────────────────────────

const SCREEN_MAP: Record<string, string> = {
  inventory: "/(tabs)/inventory",
  sessions: "/(tabs)/sessions",
  art: "/(tabs)/art",
  settings: "/settings",
  transfer: "/transfer",
  transfers: "/transfer",
  receive: "/receive",
  receiving: "/receive",
  dashboard: "/(tabs)",
  home: "/(tabs)",
};

// ── Helpers ────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Extract the first number from the transcript (digit or word).
 * Returns the number and the transcript with that token removed.
 */
function extractQuantity(text: string): {
  quantity: number | null;
  rest: string;
} {
  // Try digit patterns first (e.g. "3", "12")
  const digitMatch = text.match(/\b(\d+)\b/);
  if (digitMatch) {
    return {
      quantity: parseInt(digitMatch[1], 10),
      rest: text.replace(digitMatch[0], " ").trim(),
    };
  }

  // Try number words
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const num = NUMBER_WORDS[words[i]];
    if (num !== undefined) {
      const rest = [...words.slice(0, i), ...words.slice(i + 1)].join(" ");
      return { quantity: num, rest };
    }
  }

  return { quantity: null, rest: text };
}

/**
 * Fuzzy match: find the longest item name that appears as a substring
 * in the transcript. Both sides are normalized.
 */
function matchItem(
  text: string,
  items: Array<{ id: string; name: string }>,
): { id: string; name: string } | null {
  const norm = normalize(text);
  let best: { id: string; name: string } | null = null;
  let bestLen = 0;

  for (const item of items) {
    const itemNorm = normalize(item.name);
    if (norm.includes(itemNorm) && itemNorm.length > bestLen) {
      best = item;
      bestLen = itemNorm.length;
    }
  }

  return best;
}

/**
 * Match a sub-area label in a portion of the transcript.
 * Labels are "Area — SubArea" format; we normalize and match substring.
 */
function matchSubArea(
  text: string,
  subAreas: Array<{ id: string; label: string }>,
): { id: string; label: string } | null {
  const norm = normalize(text);
  let best: { id: string; label: string } | null = null;
  let bestLen = 0;

  for (const sa of subAreas) {
    // Match against full label and also just the sub-area part after " — "
    const fullNorm = normalize(sa.label);
    const parts = sa.label.split(" — ");
    const subNorm = parts.length > 1 ? normalize(parts[1]) : fullNorm;

    if (norm.includes(fullNorm) && fullNorm.length > bestLen) {
      best = sa;
      bestLen = fullNorm.length;
    } else if (norm.includes(subNorm) && subNorm.length > bestLen) {
      best = sa;
      bestLen = subNorm.length;
    }
  }

  return best;
}

/**
 * Parse "from X to Y" segments for transfer commands.
 * Splits on "from" and "to" keywords.
 */
function extractSubAreas(
  text: string,
  subAreas: Array<{ id: string; label: string }>,
): { fromSubAreaId: string | null; toSubAreaId: string | null } {
  let fromSubAreaId: string | null = null;
  let toSubAreaId: string | null = null;

  // Try to find "from ... to ..." pattern
  const fromToMatch = text.match(/\bfrom\s+(.+?)\s+to\s+(.+)/i);
  if (fromToMatch) {
    const fromPart = fromToMatch[1];
    const toPart = fromToMatch[2];
    const fromMatch = matchSubArea(fromPart, subAreas);
    const toMatch = matchSubArea(toPart, subAreas);
    if (fromMatch) fromSubAreaId = fromMatch.id;
    if (toMatch) toSubAreaId = toMatch.id;
    return { fromSubAreaId, toSubAreaId };
  }

  // Try "from ..." alone
  const fromMatch = text.match(/\bfrom\s+(.+)/i);
  if (fromMatch) {
    const match = matchSubArea(fromMatch[1], subAreas);
    if (match) fromSubAreaId = match.id;
  }

  // Try "to ..." alone
  const toMatch = text.match(/\bto\s+(.+)/i);
  if (toMatch) {
    const match = matchSubArea(toMatch[1], subAreas);
    if (match) toSubAreaId = match.id;
  }

  return { fromSubAreaId, toSubAreaId };
}

// ── Spoken weight parser ───────────────────────────────────────────────

const ALL_NUMBER_WORDS: Record<string, number> = { ...NUMBER_WORDS, ...TENS_WORDS };

/**
 * Parse a spoken weight transcript into grams.
 * Handles: "720", "seven hundred twenty", "seven twenty", "three fifty",
 * "seven hundred and twenty grams", etc.
 * Returns null if unparseable or outside 1–9999 range.
 */
export function parseSpokenWeight(transcript: string): number | null {
  const text = transcript
    .toLowerCase()
    .replace(/[.,!?]/g, "")
    .replace(/\b(grams?|gram|g)\b/g, "")
    .replace(/\b(um|uh|like|about|approximately|around)\b/g, "")
    .replace(/\band\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;

  // 1. Direct digit string: "720", "1200"
  const digitMatch = text.match(/^\d+$/);
  if (digitMatch) {
    const n = parseInt(text, 10);
    return n >= 1 && n <= 9999 ? n : null;
  }

  const words = text.split(/\s+/);

  // 2. Informal shorthand: "seven twenty" → 720, "three fifty" → 350
  //    Pattern: <ones/teens> <tens> where first word * 100 + second word
  //    Must check before compound words, otherwise "seven twenty" → 7+20=27
  if (words.length === 2) {
    const first = ALL_NUMBER_WORDS[words[0]];
    const second = ALL_NUMBER_WORDS[words[1]];
    if (first !== undefined && second !== undefined && first >= 1 && first <= 19 && second >= 20 && second <= 90) {
      const result = first * 100 + second;
      if (result >= 1 && result <= 9999) return result;
    }
  }

  // 3. Try to parse as compound number words
  let total = 0;
  let current = 0;
  let parsed = false;

  for (const w of words) {
    if (w === "hundred") {
      current = current === 0 ? 100 : current * 100;
      parsed = true;
    } else if (w === "thousand") {
      current = current === 0 ? 1000 : current * 1000;
      total += current;
      current = 0;
      parsed = true;
    } else if (NUMBER_WORDS[w] !== undefined) {
      current += NUMBER_WORDS[w];
      parsed = true;
    } else if (TENS_WORDS[w] !== undefined) {
      current += TENS_WORDS[w];
      parsed = true;
    } else {
      // Unknown word — skip
    }
  }

  if (parsed) {
    total += current;
    if (total >= 1 && total <= 9999) return total;
  }

  return null;
}

// ── Main parser ────────────────────────────────────────────────────────

export function parseVoiceCommand(
  transcript: string,
  context: VoiceContext,
): VoiceCommandResult | null {
  const text = normalize(transcript);

  // ── 0. Stop listening ────────────────────────────────────────────
  if (text === "stop" || text === "stop listening") {
    return { action: "stop-listening" };
  }

  // ── 1. Connect to scale ──────────────────────────────────────────
  if (text.includes("connect") && text.includes("scale")) {
    for (const profile of context.scaleProfiles) {
      if (text.includes(normalize(profile.name))) {
        return { action: "connect-scale", profileId: profile.id };
      }
    }
    if (context.scaleProfiles.length === 1) {
      return { action: "connect-scale", profileId: context.scaleProfiles[0].id };
    }
    return { action: "connect-scale", profileId: null };
  }

  // ── 2. Transfer ──────────────────────────────────────────────────
  if (text.includes("transfer")) {
    const after = text.split("transfer").slice(1).join("transfer").trim();
    const { quantity, rest } = extractQuantity(after);
    const item = matchItem(rest, context.inventoryItems);
    const { fromSubAreaId, toSubAreaId } = extractSubAreas(
      after,
      context.subAreas,
    );

    return {
      action: "transfer",
      itemId: item?.id ?? null,
      itemName: item?.name ?? null,
      quantity,
      fromSubAreaId,
      toSubAreaId,
    };
  }

  // ── 3. Receive ───────────────────────────────────────────────────
  if (text.includes("receive") || text.includes("receiving")) {
    const keyword = text.includes("receiving") ? "receiving" : "receive";
    const after = text.split(keyword).slice(1).join(keyword).trim();
    const { quantity, rest } = extractQuantity(after);
    const item = matchItem(rest, context.inventoryItems);

    return {
      action: "receive",
      itemId: item?.id ?? null,
      itemName: item?.name ?? null,
      quantity,
    };
  }

  // ── 4. Add item ──────────────────────────────────────────────────
  if (text.includes("add")) {
    const after = text.split("add").slice(1).join("add").trim();
    const { quantity, rest } = extractQuantity(after);
    const item = matchItem(rest, context.inventoryItems);

    return {
      action: "add-item",
      itemId: item?.id ?? null,
      itemName: item?.name ?? null,
      quantity,
    };
  }

  // ── 5. Navigation ────────────────────────────────────────────────
  const navMatch = text.match(/\bgo\s+to\s+(\w+)/);
  if (navMatch) {
    const target = navMatch[1];
    const screen = SCREEN_MAP[target];
    if (screen) {
      return { action: "navigate", screen };
    }
  }

  return null;
}
