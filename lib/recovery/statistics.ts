import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, apiError } from "@/lib/auth/http";
import { requireRecoveryRole, recoveryExecutives } from "./allocation";
import { summarizeRecovery, recoveryLeaderboard, dailyRecovery } from "./summary";
export async function recoveryStatistics(request: NextRequest, individual: boolean) {
  try {
    const user = await requireRecoveryRole(individual ? "recovery_executive" : "recovery_admin");
    const month = request.nextUrl.searchParams.get("month");
    const owner = individual ? { assignedTo: user.id } : {};
    const client = db();
    const [rows, monthRows, executives, period] = await Promise.all([
      client.recoveryLead.findMany({ where: { ...owner, ...(month === null ? {} : { selectedMonth: month }) }, select: { assignedTo: true, amountMentioned: true, paymentStatus: true, leadStatus: true, paidAt: true } }),
      client.recoveryLead.findMany({ where: owner, distinct: ["selectedMonth"], select: { selectedMonth: true }, orderBy: { selectedMonth: "asc" } }),
      individual ? Promise.resolve([]) : recoveryExecutives(),
      individual ? Promise.resolve(null) : client.recoveryPeriod.findFirst({ orderBy: { startedAt: "desc" } }),
    ]);
    const unassigned = rows.filter(row => !row.assignedTo);
    return json({ summary: summarizeRecovery(rows), leaders: individual ? [] : recoveryLeaderboard(rows, executives), period, daily: individual || !period ? { days: [], undated: 0 } : dailyRecovery(rows, period), unassigned: summarizeRecovery(unassigned), months: monthRows.map(row => row.selectedMonth) });
  } catch (error) { return apiError(error); }
}
