import { TRPCError } from "@trpc/server";

const isProd = process.env.NODE_ENV === "production";

// Auth paths whose input should never be logged
const SENSITIVE_PATHS = new Set([
  "auth.login",
  "auth.loginWithPin",
  "auth.mfaLogin",
  "auth.resetPassword",
  "auth.acceptInvite",
  "auth.createUser",
  "auth.updateUser",
  "auth.mfaDisable",
  "auth.mfaSetup",
  "auth.mfaVerify",
  "auth.verifyPin",
  "auth.reAuthenticate",
]);

// Messages safe to forward to clients (intentionally thrown by our code)
const SAFE_TRPC_CODES = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "BAD_REQUEST",
  "CONFLICT",
  "TOO_MANY_REQUESTS",
  "TIMEOUT",
]);

// Generic messages per code (used in prod for unexpected errors)
const GENERIC_MESSAGES: Record<string, string> = {
  BAD_REQUEST: "Invalid request",
  UNAUTHORIZED: "Authentication required",
  FORBIDDEN: "Access denied",
  NOT_FOUND: "Resource not found",
  CONFLICT: "Resource conflict",
  INTERNAL_SERVER_ERROR: "An unexpected error occurred",
  TOO_MANY_REQUESTS: "Too many requests",
};

/**
 * Determine if an error message is safe to show to clients.
 * TRPCErrors we threw intentionally are safe.
 * Prisma/unexpected errors are not.
 */
function isSafeError(error: TRPCError): boolean {
  if (SAFE_TRPC_CODES.has(error.code) && !error.cause) {
    return true;
  }
  return false;
}

/**
 * Get the client-facing message for an error.
 * In dev: always return original message.
 * In prod: return original only for intentional TRPCErrors, generic otherwise.
 */
export function getClientMessage(error: TRPCError): string {
  if (!isProd) return error.message;
  if (isSafeError(error)) return error.message;
  return GENERIC_MESSAGES[error.code] || GENERIC_MESSAGES.INTERNAL_SERVER_ERROR;
}

/**
 * Log an error with full detail (server-side only).
 * Auth endpoints have their input redacted.
 */
export function logError(opts: {
  requestId: string;
  path: string | undefined;
  error: TRPCError;
  input: unknown;
  userId?: string;
}) {
  const { requestId, path, error, input, userId } = opts;
  const logInput = path && SENSITIVE_PATHS.has(path) ? "[REDACTED]" : input;

  console.error(
    JSON.stringify({
      level: "error",
      requestId,
      path,
      code: error.code,
      message: error.message,
      userId: userId ?? null,
      input: logInput,
      cause: error.cause instanceof Error ? error.cause.message : undefined,
      stack: isProd ? undefined : error.stack,
      timestamp: new Date().toISOString(),
    })
  );
}

export { SENSITIVE_PATHS };
