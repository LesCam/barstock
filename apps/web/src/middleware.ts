import { NextRequest, NextResponse } from "next/server";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// ─── In-memory rate limiter (inline for Edge Runtime compatibility) ──────────
interface RLEntry { timestamps: number[] }
const rlStores = new Map<string, Map<string, RLEntry>>();

function checkRateLimit(store: string, key: string, limit: number, windowMs: number): { limited: boolean; retryAfterMs?: number } {
  let s = rlStores.get(store);
  if (!s) { s = new Map(); rlStores.set(store, s); }
  const now = Date.now();
  let e = s.get(key);
  if (!e) { e = { timestamps: [] }; s.set(key, e); }
  e.timestamps = e.timestamps.filter((t) => now - t < windowMs);
  if (e.timestamps.length >= limit) {
    return { limited: true, retryAfterMs: windowMs - (now - e.timestamps[0]) };
  }
  e.timestamps.push(now);
  return { limited: false };
}

function getClientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
}

// Auth-related tRPC mutations that should be rate-limited
const AUTH_PROCEDURES = new Set([
  "auth.login", "auth.loginWithPin", "auth.verifyPin",
  "auth.requestPasswordReset", "auth.resetPassword", "auth.acceptInvite",
]);
const EXPENSIVE_PROCEDURES = new Set([
  "pos.importCsv", "scan.bulkImport",
  "reports.variance", "reports.expectedOnHand", "reports.portfolioRollup",
  "reports.forecastDashboard", "reports.forecastItemDetail",
  "inventory.bulkCreate",
]);

// Routes that serve public, cacheable content (their handlers set their own Cache-Control)
const PUBLIC_CACHEABLE_PREFIXES = ["/api/uploads/", "/api/guide/"];
// next-auth manages its own caching and cookies — don't interfere
const AUTH_PREFIXES = ["/api/auth/"];

/** Set no-store headers on a response to prevent caching of authenticated/tenant data */
function setNoStoreHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}

/** Return NextResponse.next() with no-store headers unless the route is public-cacheable or auth */
function nextWithCachePolicy(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;
  const isPublicCacheable = PUBLIC_CACHEABLE_PREFIXES.some((p) => path.startsWith(p));
  const isAuth = AUTH_PREFIXES.some((p) => path.startsWith(p));
  if (isPublicCacheable || isAuth) return NextResponse.next();
  return setNoStoreHeaders(NextResponse.next());
}

// ─── CSRF origin validation ─────────────────────────────────────────────────

function checkCsrf(request: NextRequest): NextResponse | null {
  // Mobile app and cron jobs use Bearer tokens — CSRF doesn't apply
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return null;

  // Server-side calls (Next.js server components, internal fetch) set this header
  if (request.headers.get("x-internal-request") === "1") return null;

  // In production, reject missing Origin — browsers always send it on mutating requests.
  // In dev, allow missing Origin for curl/Postman/server-to-server testing.
  const origin = request.headers.get("origin");
  if (!origin) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Forbidden – missing origin", { status: 403 });
    }
    return null;
  }

  // Derive expected origin from forwarded headers (Vercel, Cloudflare, nginx, etc.)
  // x-forwarded-proto can be comma-separated ("https, http") — first value is client-facing
  // Default to 'https' in production (behind TLS proxy), 'http' in dev
  const defaultProto = process.env.NODE_ENV === "production" ? "https" : "http";
  const proto = (request.headers.get("x-forwarded-proto") ?? defaultProto).split(",")[0].trim();
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Compare just the origin (scheme + host), ignoring any path/query on Origin header
  const expectedOrigin = `${proto}://${host}`;
  let originHost: string;
  try {
    const parsed = new URL(origin);
    originHost = `${parsed.protocol}//${parsed.host}`;
  } catch {
    return new NextResponse("Forbidden – malformed origin", { status: 403 });
  }

  if (originHost !== expectedOrigin) {
    return new NextResponse("Forbidden – origin mismatch", { status: 403 });
  }

  return null; // CSRF OK
}

// ─── Middleware ──────────────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const ip = getClientIp(request);

  // Per-user key: try to extract userId from session cookie (lightweight, no DB call)
  const sessionCookie = request.cookies.get("__Host-authjs.session-token")?.value
    ?? request.cookies.get("authjs.session-token")?.value;
  let userId: string | undefined;
  if (sessionCookie) {
    try {
      // JWT payload is the second base64 segment — decode without verification (just for keying)
      const payload = JSON.parse(atob(sessionCookie.split(".")[1]));
      if (typeof payload.userId === "string") userId = payload.userId;
    } catch { /* not a valid JWT, ignore */ }
  }

  // Compound key: IP always, + userId when available
  const ipKey = `ip:${ip}`;
  const userKey = userId ? `${ipKey}:user:${userId}` : ipKey;

  // Rate-limit auth and expensive tRPC mutations
  if (request.method === "POST" && request.nextUrl.pathname.startsWith("/api/trpc/")) {
    const procedure = request.nextUrl.pathname.replace("/api/trpc/", "").split("?")[0];

    if (AUTH_PROCEDURES.has(procedure)) {
      // 10 attempts per 15 min per IP (auth endpoints are unauthenticated)
      const result = checkRateLimit("auth", ipKey, 10, 15 * 60 * 1000);
      if (result.limited) {
        return new NextResponse(JSON.stringify({ error: "Too Many Requests" }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((result.retryAfterMs ?? 0) / 1000)) },
        });
      }
    }

    if (EXPENSIVE_PROCEDURES.has(procedure)) {
      // 30 per min per IP+user
      const result = checkRateLimit("expensive", userKey, 30, 60 * 1000);
      if (result.limited) {
        return new NextResponse(JSON.stringify({ error: "Too Many Requests" }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((result.retryAfterMs ?? 0) / 1000)) },
        });
      }
    }
  }

  // Rate-limit non-tRPC POST endpoints (CSV upload)
  if (request.method === "POST" && request.nextUrl.pathname === "/api/pos/upload-csv") {
    const result = checkRateLimit("expensive", userKey, 30, 60 * 1000);
    if (result.limited) {
      return new NextResponse(JSON.stringify({ error: "Too Many Requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((result.retryAfterMs ?? 0) / 1000)) },
      });
    }
  }

  // ─── CSRF origin check (only for mutating requests) ─────────────────────

  if (MUTATING_METHODS.has(request.method)) {
    const csrfBlock = checkCsrf(request);
    if (csrfBlock) return csrfBlock;
  }

  return nextWithCachePolicy(request);
}

export const config = {
  matcher: "/api/:path*",
};
