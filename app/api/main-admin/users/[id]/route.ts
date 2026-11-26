import type { NextRequest } from "next/server";
import { updateAccount } from "@/lib/auth/admin-users";
import { json, apiError, readAdminBody } from "@/lib/auth/http";
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await readAdminBody(request);
    const { id } = await context.params;
    return json({ user: await updateAccount(id, body) });
  } catch (error) { return apiError(error); }
}
