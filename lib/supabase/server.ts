import "server-only";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { authConfig } from "./config";

export async function createAuthClient(readOnly = false) {
  await connection();
  const store = await cookies();
  // Load the Auth SDK only after entering request-time rendering.
  // Its module/client initialization may read the current time.
  const { createServerClient } = await import("@supabase/ssr");
  const { url, key } = authConfig();
  return createServerClient(url, key, {
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        if (readOnly) return; // Proxy owns refresh cookies during Server Component reads.
        values.forEach(({ name, value, options }) => store.set(name, value, options));
      },
    },
  });
}
