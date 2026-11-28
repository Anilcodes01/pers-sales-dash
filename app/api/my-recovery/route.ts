import { salesRecoveryVisibility } from "@/lib/recovery/sales-visibility";
import type { NextRequest } from "next/server";
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
    if (!hasRole(user.app_metadata, "team_leader") && !hasRole(user.app_metadata, "sales_executive")) throw new AccessError(403, "This recovery list is for sales employees and team leads.");
    const requestedCursor = request.nextUrl.searchParams.get("cursor");
    if (requestedCursor !== null && !/^\d{1,19}$/.test(requestedCursor)) throw new AccessError(400, "Invalid sync cursor.");
    const client = db();
    const identifier = await client.employeeIdentifier.findUnique({ where: { userId: user.id }, select: { employeeId: true } });
    if (!identifier) return json({ records: [], removedIds: [], reset: true, unchanged: false, cursor: "0" });
    const visibility = salesRecoveryVisibility();
    const scope = `${identifier.employeeId}:${visibility.scope}`;
    const cursor = request.nextUrl.searchParams.get("scope") === scope ? requestedCursor : null;
    return json({ ...await sheetSnapshot(client, visibility.month, cursor, undefined, identifier.employeeId, visibility.statuses), scope });
  } catch (error) { return apiError(error); }
}
