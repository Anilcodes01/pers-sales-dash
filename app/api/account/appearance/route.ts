import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { createAuthClient } from "@/lib/supabase/server";
import { json, apiError, readAdminBody } from "@/lib/auth/http";
import { AccessError } from "@/lib/auth/admin-access";
import { isThemeColor } from "@/lib/theme-colors";
export async function PATCH(request: NextRequest) {
  try {
    if (!await currentUser()) throw new AccessError(401, "Sign in to save appearance.");
    const body = await readAdminBody(request);
    if (!isThemeColor(body.color) || Object.keys(body).some(key => key !== "color")) throw new AccessError(400, "Choose a theme color.");
    const client = await createAuthClient();
    const { error } = await client.auth.updateUser({ data: { theme_color: body.color } });
    if (error) throw new AccessError(502, "Could not save your theme color.");
    return json({ color: body.color });
  } catch (error) { return apiError(error); }
}
