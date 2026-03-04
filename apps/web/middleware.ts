import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  authLimiter,
  expensiveLimiter,
  cronLimiter,
  publicLimiter,
  getClientIp,
  rateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";

/**
 * Edge middleware for bot/brute-force protection.
 * Applies rate limiting to auth endpoints and expensive report/export paths.
 */
export async function middleware(req: NextRequest) {
  const ip = getClientIp(req);
  const path = req.nextUrl.pathname;

  // Auth endpoints: 10 requests / 15 min per IP
  if (path.startsWith("/api/auth")) {
    const result = await authLimiter.check(`auth:${ip}`);
    if (result.limited) return rateLimitResponse(result.retryAfterMs!);
  }

  // Report / export / analytics endpoints: 30 requests / min per IP
  if (
    path.startsWith("/api/trpc/reports.") ||
    path.startsWith("/api/trpc/audit.") ||
    path.startsWith("/api/trpc/parLevels.suggestions")
  ) {
    const result = await expensiveLimiter.check(`export:${ip}`);
    if (result.limited) return rateLimitResponse(result.retryAfterMs!);
  }

  // Cron endpoints: 6 requests / 5 min per IP
  if (path.startsWith("/api/cron/")) {
    const result = await cronLimiter.check(`cron:${ip}`);
    if (result.limited) return rateLimitResponse(result.retryAfterMs!);
  }

  // Public endpoints (uploads, guide): 60 requests / min per IP
  if (path.startsWith("/api/uploads/") || path.startsWith("/api/guide/")) {
    const result = await publicLimiter.check(`public:${ip}`);
    if (result.limited) return rateLimitResponse(result.retryAfterMs!);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/:path*", "/api/trpc/:path*", "/api/cron/:path*", "/api/uploads/:path*", "/api/guide/:path*"],
};
