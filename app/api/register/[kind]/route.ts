import type { NextRequest } from "next/server";
import { registerTeamMember } from "@/lib/auth/registration";
import { json, apiError, readAdminBody } from "@/lib/auth/http";
export async function POST(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  try {
    const body = await readAdminBody(request);
    const { kind } = await context.params;
    const address = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    return json(await registerTeamMember(kind, body, address), 201);
  } catch (error) { return apiError(error); }
}
