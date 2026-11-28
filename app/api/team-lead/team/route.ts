import { teamRoster } from "@/lib/teams/team-roster";
import { apiError, json } from "@/lib/auth/http";
export async function GET() {
  try { return json(await teamRoster()); }
  catch (error) { return apiError(error); }
}
