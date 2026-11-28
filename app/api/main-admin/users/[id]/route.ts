import type { NextRequest } from "next/server";
import { deleteAccount, updateAccount } from "@/lib/auth/admin-users";
import { json, apiError, readAdminBody } from "@/lib/auth/http";
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await readAdminBody(request);
    const { id } = await context.params;
    return json({ user: await updateAccount(id, body) });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await readAdminBody(request);
    if (body.confirm !== true) return json({ error: "Confirm employee deletion." }, 400);
    const { id } = await context.params;
    return json(await deleteAccount(id));
  } catch (error) { return apiError(error); }
}
