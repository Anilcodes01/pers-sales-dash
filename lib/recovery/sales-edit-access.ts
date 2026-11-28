import "server-only";
import { currentUser } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";
import { AccessError } from "@/lib/auth/admin-access";
import { db } from "@/lib/db";
import { salesRecoveryVisibility } from "./sales-visibility";
export async function salesRecoveryEditAccess() {
  const user = await currentUser();
  if (!user) throw new AccessError(401, "Sign in to continue.");
  if (!hasRole(user.app_metadata, "sales_executive") && !hasRole(user.app_metadata, "team_leader")) throw new AccessError(403, "Sales recovery access required.");
  const visibility = salesRecoveryVisibility();
  if (visibility.statuses !== null) throw new AccessError(403, "Recovery editing is available from the 6th through the 24th, India time.");
  const client = db();
  let users = [user.id];
  if (hasRole(user.app_metadata, "team_leader")) {
    const membership = await client.teamMembership.findUnique({ where: { userId: user.id }, select: { teamId: true } });
    if (membership) users = (await client.teamMembership.findMany({ where: { teamId: membership.teamId }, select: { userId: true } })).map(row => row.userId);
  }
  const ids = await client.employeeIdentifier.findMany({ where: { userId: { in: users } }, select: { employeeId: true } });
  const scope = { executiveId: { in: ids.map(row => row.employeeId) }, selectedMonth: visibility.month, salesStatusChangedAt: { not: null }, salesAssignedTo: { notIn: ["", "Unassigned"] } };
  return { user, client, scope };
}
