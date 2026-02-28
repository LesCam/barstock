export interface ParsedFrame {
  weightGrams: number;
  stable: boolean;
}

const UNIT_MULTIPLIERS: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

// A&D / CAS style: "ST,GS,+00123.4 g" or "US,GS,-00005.2 kg"
const AD_CAS_REGEX = /^(ST|US),\s*\w+,\s*([+-]?\d+\.?\d*)\s*(g|kg|oz|lb)\s*$/i;

// Simple numeric: "  123.4 g" or "456.7 kg"
const SIMPLE_REGEX = /^\s*([+-]?\d+\.?\d*)\s*(g|kg|oz|lb)\s*$/i;

/**
 * Parse a commercial scale frame string into weight and stability.
 * Returns null for unparseable frames.
 */
export function parseCommercialFrame(frame: string): ParsedFrame | null {
  const trimmed = frame.trim();
  if (!trimmed) return null;

  // Try A&D / CAS style first
  const adMatch = trimmed.match(AD_CAS_REGEX);
  if (adMatch) {
    const stable = adMatch[1].toUpperCase() === "ST";
    const value = parseFloat(adMatch[2]);
    const unit = adMatch[3].toLowerCase();
    const multiplier = UNIT_MULTIPLIERS[unit];
    if (multiplier === undefined || isNaN(value)) return null;
    return { weightGrams: value * multiplier, stable };
  }

  // Try simple numeric
  const simpleMatch = trimmed.match(SIMPLE_REGEX);
  if (simpleMatch) {
    const value = parseFloat(simpleMatch[1]);
    const unit = simpleMatch[2].toLowerCase();
    const multiplier = UNIT_MULTIPLIERS[unit];
    if (multiplier === undefined || isNaN(value)) return null;
    return { weightGrams: value * multiplier, stable: true };
  }

  return null;
}
