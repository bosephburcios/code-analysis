import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { generalLimiter, rateLimitResponse, clientIp } from "@/lib/rate-limit";

// Baseline protection for every API route, keyed by IP. Individual routes
// that trigger expensive external calls (GitHub API, the local AI model)
// layer a stricter, per-user limit on top of this — see src/lib/rate-limit.ts.
export async function proxy(request: NextRequest) {
  const result = await generalLimiter.limit(clientIp(request));
  if (!result.success) return rateLimitResponse(result);
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
