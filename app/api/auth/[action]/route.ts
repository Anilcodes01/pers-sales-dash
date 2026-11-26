import { NextResponse, type NextRequest } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";
import { dashboardPath } from "@/lib/auth/dashboard-routing";
import { authConfigured } from "@/lib/supabase/config";

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return reply({ error: "Request origin is not allowed." }, 403);
  const { action } = await context.params;
  if (!["login", "logout"].includes(action)) return reply({ error: "Not found." }, 404);
  if (!authConfigured()) return reply({ error: "Authentication is not configured yet. Ask your administrator to complete setup." }, 503);
  try {
    const client = await createAuthClient();
    if (action === "logout") {
      const { error } = await client.auth.signOut();
      return error ? reply({ error: "Could not sign out. Please retry." }, 502) : reply({ redirect: "/login" });
    }
    if (Number(request.headers.get("content-length")) > 8192) return reply({ error: "Request is too large." }, 413);
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return reply({ error: "Enter a valid email address." }, 400);
    if (action === "login") {
      if (!password || password.length > 128) return reply({ error: "Enter your password (maximum 128 characters)." }, 400);
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) return reply({ error: error.status === 429 ? "Too many attempts. Please try again later." : "Unable to sign in. Check the email and password provided by your administrator." }, error.status === 429 ? 429 : 401);
      return reply({ redirect: dashboardPath(data?.user?.app_metadata.role) });
    }
  } catch {
    return reply({ error: "Unable to process this request. Please try again." }, 400);
  }
}
