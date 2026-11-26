import { db } from "@/lib/db";
import { json, apiError } from "@/lib/auth/http";
import { requireRecoveryRole, recoveryExecutives } from "@/lib/recovery/allocation";
export async function GET() {
  try {
    await requireRecoveryRole("recovery_admin");
    const [executives, months] = await Promise.all([recoveryExecutives(), db().recoveryLead.findMany({ distinct: ["selectedMonth"], select: { selectedMonth: true }, orderBy: { selectedMonth: "asc" } })]);
    return json({ executives, months: months.map(row => row.selectedMonth) });
  } catch (error) { return apiError(error); }
}
