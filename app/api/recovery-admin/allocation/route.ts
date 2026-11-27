import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { AccessError } from "@/lib/auth/admin-access";
import { json, apiError, readAdminBody } from "@/lib/auth/http";
import { requireRecoveryRole, allocateLeads } from "@/lib/recovery/allocation";
import { sheetSnapshot } from "@/lib/recovery/sheet-sync";
export async function GET(request: NextRequest) {
  try {
    await requireRecoveryRole("recovery_admin");
    const month = request.nextUrl.searchParams.get("month");
    if (month === null) throw new AccessError(400, "Select a month.");
    const cursor = request.nextUrl.searchParams.get("cursor");
    if (cursor !== null && !/^\d{1,19}$/.test(cursor)) return json({ error: "Invalid sync cursor." }, 400);
    const snapshot = await sheetSnapshot(db(), month, cursor);
    return json({ ...snapshot, ...(snapshot.reset ? { total: snapshot.records.length } : {}) });
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try { const user = await requireRecoveryRole("recovery_admin"); return json(await allocateLeads(user.id, await readAdminBody(request, 1024 * 1024))); }
  catch (error) { return apiError(error); }
}
