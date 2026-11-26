import type { NextRequest } from "next/server";
import { assignTeam } from "@/lib/teams/service";
import { json, apiError, readAdminBody } from "@/lib/auth/http";
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await readAdminBody(request);
    const { id } = await context.params;
    return json({ membership: await assignTeam(id, body) });
  } catch (error) { return apiError(error); }
}
