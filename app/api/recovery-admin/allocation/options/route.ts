import { db } from "@/lib/db";
import { json, apiError } from "@/lib/auth/http";
import { requireRecoveryRole, recoveryExecutives } from "@/lib/recovery/allocation";
import type { NextRequest } from "next/server";
import { cachedRecovery } from "@/lib/recovery/cache";
export async function GET(request: NextRequest) {
  try {
    await requireRecoveryRole("recovery_admin");
    const fresh = request.nextUrl.searchParams.get("fresh") === "1";
    const [executives, months] = await Promise.all([recoveryExecutives(fresh), cachedRecovery("months:admin", 60000, () => db().recoveryLead.findMany({ distinct: ["selectedMonth"], select: { selectedMonth: true }, orderBy: { selectedMonth: "asc" } }), fresh)]);
    return json({ executives, months: months.map(row => row.selectedMonth) });
  } catch (error) { return apiError(error); }
}
