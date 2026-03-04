/**
 * Log redaction utility — strips sensitive values before logging.
 *
 * Usage:
 *   console.log("Request:", redactHeaders(req.headers));
 *   console.log("Body:", redactFields(body));
 */

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
]);

const SENSITIVE_FIELDS = new Set([
  "password",
  "passcode",
  "pin",
  "token",
  "secret",
  "accessToken",
  "refreshToken",
  "sessionToken",
  "resetToken",
  "currentPassword",
  "newPassword",
  "confirmPassword",
]);

const REDACTED = "[REDACTED]";

/** Redact sensitive headers from a Headers object or plain object. */
export function redactHeaders(
  headers: Headers | Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? REDACTED : value;
    });
  } else {
    for (const [key, value] of Object.entries(headers)) {
      result[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? REDACTED : value;
    }
  }

  return result;
}

/** Redact sensitive fields from a plain object (shallow). */
export function redactFields<T extends Record<string, unknown>>(
  obj: T
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = SENSITIVE_FIELDS.has(key) ? REDACTED : value;
  }
  return result;
}
