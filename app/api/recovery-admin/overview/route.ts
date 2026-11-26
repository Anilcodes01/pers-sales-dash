import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, apiError } from "@/lib/auth/http";
import { requireRecoveryRole, recoveryExecutives } from "@/lib/recovery/allocation";
export async function GET(request: NextRequest) {
  try {
    await requireRecoveryRole("recovery_admin");
    const month = request.nextUrl.searchParams.get("month");
    const client = db(); const where = month === null ? {} : { selectedMonth: month };
    const [records, months, executives] = await Promise.all([
      client.recoveryLead.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }),
      client.recoveryLead.findMany({ distinct: ["selectedMonth"], select: { selectedMonth: true }, orderBy: { selectedMonth: "asc" } }),
      recoveryExecutives(),
    ]);
    return json({ records, months: months.map(row => row.selectedMonth), executives });
  } catch (error) { return apiError(error); }
}
