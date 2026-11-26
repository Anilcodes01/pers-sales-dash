import type { NextRequest } from "next/server";
import { listTeams, createTeam } from "@/lib/teams/service";
import { json, apiError, readAdminBody } from "@/lib/auth/http";
export async function GET() {
  try { return json({ teams: await listTeams() }); } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try { return json({ team: await createTeam(await readAdminBody(request)) }, 201); } catch (error) { return apiError(error); }
}
