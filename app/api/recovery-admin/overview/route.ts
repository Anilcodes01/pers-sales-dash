import type { NextRequest } from "next/server";
import { sheetSnapshot } from "@/lib/recovery/sheet-sync";
import { cachedRecovery } from "@/lib/recovery/cache";
import { db } from "@/lib/db";
import { json, apiError } from "@/lib/auth/http";
import { requireRecoveryRole, recoveryExecutives } from "@/lib/recovery/allocation";
export async function GET(request: NextRequest) {
  try {
    await requireRecoveryRole("recovery_admin");
    const month = request.nextUrl.searchParams.get("month");
    const cursor = request.nextUrl.searchParams.get("cursor");
    if (cursor !== null && !/^\d{1,19}$/.test(cursor)) return json({ error: "Invalid sync cursor." }, 400);
    const client = db();
    const snapshot = await sheetSnapshot(client, month, cursor);
    // Delta polling does not repeatedly fetch the Supabase user directory.
    if (cursor !== null) return json(snapshot);
    const fresh = request.nextUrl.searchParams.get("fresh") === "1";
    const [months, executives] = await Promise.all([
      cachedRecovery("months:admin", 60000, () => client.recoveryLead.findMany({ distinct: ["selectedMonth"], select: { selectedMonth: true }, orderBy: { selectedMonth: "asc" } }), fresh),
      recoveryExecutives(fresh),
    ]);
    return json({ ...snapshot, months: months.map(row => row.selectedMonth), executives });
  } catch (error) { return apiError(error); }
}
