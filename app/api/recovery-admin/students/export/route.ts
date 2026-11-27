import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireRecoveryRole } from "@/lib/recovery/allocation";
import { studentPaymentFilter } from "@/lib/recovery/student-filter";
import { leadColumns } from "@/lib/recovery/columns";
import { currentRecoveryMonth } from "@/lib/recovery/month";
import { apiError } from "@/lib/auth/http";
const csvCell = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? "'" : "") + value.replace(/"/g, '""')}"`;
export async function GET(request: NextRequest) {
  try {
    await requireRecoveryRole("recovery_admin");
    const month = request.nextUrl.searchParams.has("allMonths") ? null : request.nextUrl.searchParams.get("month") ?? currentRecoveryMonth();
    const status = request.nextUrl.searchParams.get("status");
    const keys = Object.keys(leadColumns) as (keyof typeof leadColumns)[];
    const rows = await db().recoveryLead.findMany({ where: { ...studentPaymentFilter(status), ...(month === null ? {} : { selectedMonth: month }) }, select: Object.fromEntries(keys.map(key => [key, true])), orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
    const csv = [Object.values(leadColumns).map(csvCell).join(","), ...rows.map(row => keys.map(key => csvCell(String(row[key] ?? ""))).join(","))].join("\r\n");
    return new Response("\uFEFF" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="recovery-students-${status || "all"}.csv"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
