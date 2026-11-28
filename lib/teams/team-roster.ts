import "server-only";
import { currentUser } from "@/lib/auth/session";
import { AccessError } from "@/lib/auth/admin-access";
import { assignedRoles, hasRole } from "@/lib/auth/roles";
import { db } from "@/lib/db";

export async function teamRoster() {
  const user = await currentUser();
  if (!user) throw new AccessError(401, "Sign in to continue.");
  if (!hasRole(user.app_metadata, "team_leader")) throw new AccessError(403, "Only team leads can view this team list.");
  const membership = await db().teamMembership.findUnique({ where: { userId: user.id }, select: { teamId: true, team: { select: { name: true } } } });
  if (!membership) return { team: null, employees: [] };
  // Team scope comes exclusively from the signed-in lead's membership.
  // Select only roster fields; never retrieve employee passwords or Auth tokens.
  const rows = await db().$queryRaw<{ id: string; name: string | null; email: string | null; employee_id: string | null; role: unknown; roles: unknown; last_sign_in_at: Date | null }[]>`
    SELECT u.id, u.raw_user_meta_data->>'full_name' AS name, u.email,
      e.employee_id, u.raw_app_meta_data->>'role' AS role,
      u.raw_app_meta_data->'roles' AS roles, u.last_sign_in_at
    FROM public.team_memberships m
    JOIN auth.users u ON u.id = m.user_id
    LEFT JOIN public.employee_identifiers e ON e.user_id = u.id
    WHERE m.team_id = ${membership.teamId}::uuid
    ORDER BY lower(coalesce(u.raw_user_meta_data->>'full_name', u.email)), u.id
  `;
  return {
    team: { id: membership.teamId, name: membership.team.name },
    employees: rows.map(row => ({ id: row.id, name: row.name || "", email: row.email || "", employeeId: row.employee_id, roles: assignedRoles({ role: row.role, roles: row.roles }), lastSignInAt: row.last_sign_in_at?.toISOString() || null })),
  };
}
