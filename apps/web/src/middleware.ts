import { NextRequest, NextResponse } from "next/server";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(request: NextRequest) {
  if (!MUTATING_METHODS.has(request.method)) {
    return NextResponse.next();
  }

  // Mobile app and cron jobs use Bearer tokens — CSRF doesn't apply
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return NextResponse.next();
  }

  // Server-side calls (Next.js server components, internal fetch) set this header
  if (request.headers.get("x-internal-request") === "1") {
    return NextResponse.next();
  }

  // In production, reject missing Origin — browsers always send it on mutating requests.
  // In dev, allow missing Origin for curl/Postman/server-to-server testing.
  const origin = request.headers.get("origin");
  if (!origin) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Forbidden – missing origin", { status: 403 });
    }
    return NextResponse.next();
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

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
