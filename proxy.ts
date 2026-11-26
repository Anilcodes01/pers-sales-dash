import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig, authConfigured } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  if (!authConfigured()) return response;
  const { url, key } = authConfig();
  const client = createServerClient(url, key, {
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        response.headers.set("Cache-Control", "private, no-store");
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await client.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/", "/login", "/account", "/dashboard", "/admin-dashboard", "/recovery-dashboard", "/recovery-executive-dashboard", "/sales-dashboard", "/team-dashboard", "/sales", "/sales-imports", "/team-imports", "/users/:path*", "/teams/:path*", "/api/auth/:path*", "/api/sales-executives/:path*", "/api/team-lead/:path*", "/api/main-admin/:path*"],
};
