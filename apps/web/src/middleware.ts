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

  // Non-browser clients (curl, server-to-server) don't send Origin
  const origin = request.headers.get("origin");
  if (!origin) {
    return NextResponse.next();
  }

  // Derive expected origin from request headers
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host = request.headers.get("host");
  if (!host) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const expectedOrigin = `${proto}://${host}`;
  if (origin !== expectedOrigin) {
    return new NextResponse("Forbidden – origin mismatch", { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
