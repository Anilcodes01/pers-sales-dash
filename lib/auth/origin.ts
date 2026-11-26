import type { NextRequest } from "next/server";

// Amplify can expose an internal URL to SSR. Trust the configured public origin,
// never a forwarded host supplied by the caller.
export function isAllowedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) return false;
    const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : request.nextUrl.origin;
    return origin === expected;
  } catch {
    return false;
  }
}
