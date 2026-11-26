import "server-only";
import { connection } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";
import { authConfigured } from "@/lib/supabase/config";

// Always verify remotely and compare credential versions to reject sessions from before an admin reset.
export async function currentUser(readOnly = false) {
  // Supabase uses the clock internally; defer SDK work until an actual request.
  await connection();
  if (!authConfigured()) return null;
  const client = await createAuthClient(readOnly);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const { data: claims, error: claimError } = await client.auth.getClaims();
  if (claimError || !claims?.claims) return null;
  const tokenMetadata = claims.claims.app_metadata as Record<string, unknown> | undefined;
  if (data.user.app_metadata.credentials_version !== tokenMetadata?.credentials_version) return null;
  return data.user;
}
