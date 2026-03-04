import "server-only";

const isProd = process.env.NODE_ENV === "production";

/** Env vars that must never be exposed via NEXT_PUBLIC_ */
const SECRET_NAMES = [
  "SECRET_KEY",
  "NEXTAUTH_SECRET",
  "AUTH_SECRET",
  "DATABASE_URL",
  "MFA_ENCRYPTION_KEY",
  "CRON_SECRET",
  "RESEND_API_KEY",
  "GEMINI_API_KEY",
  "TOAST_SFTP_PASS",
];

interface EnvRule {
  key: string;
  required: boolean | "production"; // true = always, "production" = only in prod
  minLength?: number;
  validate?: (value: string) => string | null; // return error message or null
}

const rules: EnvRule[] = [
  {
    key: "DATABASE_URL",
    required: true,
    validate: (v) =>
      v.startsWith("postgresql://") || v.startsWith("postgres://")
        ? null
        : "must be a postgresql:// connection string",
  },
  {
    key: "NEXTAUTH_URL",
    required: "production",
    validate: (v) =>
      isProd && !v.startsWith("https://")
        ? "must be https:// in production"
        : null,
  },
  {
    key: "SECRET_KEY",
    required: "production",
    minLength: 32,
    validate: (v) =>
      v === "change-me-in-production"
        ? "using insecure default value"
        : null,
  },
  {
    key: "AUTH_SECRET",
    required: false,
    minLength: 32,
  },
  {
    key: "NEXTAUTH_SECRET",
    required: false,
    minLength: 32,
    validate: (_v) => {
      // At least one of AUTH_SECRET or NEXTAUTH_SECRET must exist in prod
      if (
        isProd &&
        !process.env.AUTH_SECRET &&
        !process.env.NEXTAUTH_SECRET
      ) {
        return "AUTH_SECRET or NEXTAUTH_SECRET must be set in production";
      }
      return null;
    },
  },
  {
    key: "MFA_ENCRYPTION_KEY",
    required: "production",
    validate: (v) =>
      /^[0-9a-f]{64}$/i.test(v)
        ? null
        : "must be a 64-character hex string (32 bytes)",
  },
  {
    key: "CRON_SECRET",
    required: "production",
    minLength: 16,
  },
];

let validated = false;

/**
 * Validate required server environment variables.
 * Throws on first call if any required vars are missing or invalid.
 * Safe to call multiple times — only runs once.
 */
export function assertServerEnv(): void {
  if (validated) return;
  validated = true;

  const errors: string[] = [];

  // Check for secrets leaked via NEXT_PUBLIC_
  for (const name of SECRET_NAMES) {
    const publicKey = `NEXT_PUBLIC_${name}`;
    if (process.env[publicKey]) {
      errors.push(`${publicKey}: secret exposed as NEXT_PUBLIC_ (would leak to browser)`);
    }
  }

  // Validate each rule
  for (const rule of rules) {
    const value = process.env[rule.key];
    const isRequired =
      rule.required === true || (rule.required === "production" && isProd);

    if (!value) {
      if (isRequired) {
        errors.push(`${rule.key}: required but not set`);
      }
      continue;
    }

    if (rule.minLength && value.length < rule.minLength) {
      if (isRequired) {
        errors.push(
          `${rule.key}: too short (${value.length} chars, need ${rule.minLength}+)`
        );
      }
    }

    if (rule.validate) {
      const msg = rule.validate(value);
      if (msg) errors.push(`${rule.key}: ${msg}`);
    }
  }

  if (errors.length > 0) {
    const header = `\n[ENV] ${errors.length} configuration error(s):\n`;
    const body = errors.map((e) => `  - ${e}`).join("\n");
    throw new Error(header + body + "\n");
  }
}
