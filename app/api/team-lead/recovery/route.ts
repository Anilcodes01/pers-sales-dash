import { salesRecoveryVisibility } from "@/lib/recovery/sales-visibility";
import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { currentUser } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";
import { AccessError } from "@/lib/auth/admin-access";
import { db } from "@/lib/db";
import { sheetSnapshot } from "@/lib/recovery/sheet-sync";
import { apiError, json } from "@/lib/auth/http";
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) throw new AccessError(401, "Sign in to continue.");
    if (!hasRole(user.app_metadata, "team_leader")) throw new AccessError(403, "Only team leads can view team recovery.");
    const requestedCursor = request.nextUrl.searchParams.get("cursor");
    if (requestedCursor !== null && !/^\d{1,19}$/.test(requestedCursor)) throw new AccessError(400, "Invalid sync cursor.");
    const client = db();
    const membership = await client.teamMembership.findUnique({ where: { userId: user.id }, select: { teamId: true } });
    const members = membership ? await client.teamMembership.findMany({ where: { teamId: membership.teamId }, select: { userId: true } }) : [];
    const identifiers = members.length ? await client.employeeIdentifier.findMany({ where: { userId: { in: members.map(member => member.userId) } }, select: { employeeId: true } }) : [];
    const ids = identifiers.map(row => row.employeeId).sort();
    // A membership change invalidates the prior snapshot even if no lead changed.
    const visibility = salesRecoveryVisibility();
    const scope = createHash("sha256").update(JSON.stringify([membership?.teamId, ids, visibility.scope])).digest("hex");
    const cursor = request.nextUrl.searchParams.get("scope") === scope ? requestedCursor : null;
    if (!ids.length) return json({ records: [], removedIds: [], reset: true, unchanged: false, cursor: "0", scope });
    return json({ ...await sheetSnapshot(client, visibility.month, cursor, undefined, ids, visibility.statuses), scope });
  } catch (error) { return apiError(error); }
}
