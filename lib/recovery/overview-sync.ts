import type { PrismaClient } from "@prisma/client";
// Explicit projection excludes internal locks, import metadata, and legacy columns.
export const sheetSelect = {
  id: true, assignedTo: true, createdAt: true, paidAt: true,
  timestamp: true, studentName: true, studentPhone: true, studentEmail: true,
  studentCollegeEmail: true, executiveName: true, amountMentioned: true,
  programPlan: true, domain: true, selectedMonth: true, referrals: true,
  amountPaid: true, paymentStatus: true, leadStatus: true, comments: true,
  remainingAmount: true, paymentLinks: true,
} as const;
export async function overviewSnapshot(client: PrismaClient, month: string | null, cursor: string | null) {
  if (cursor !== null && !/^\d{1,19}$/.test(cursor)) throw new Error("INVALID_CURSOR");
  return client.$transaction(async tx => {
    const latest = (await tx.recoverySheetChange.aggregate({ _max: { id: true } }))._max.id ?? BigInt(0);
    const since = cursor === null ? null : BigInt(cursor);
    const where = month === null ? {} : { selectedMonth: month };
    if (since === latest) return { cursor: String(latest), records: [], removedIds: [], unchanged: true, reset: false };
    if (since === null || since > latest) {
      const records = await tx.recoveryLead.findMany({ where, select: sheetSelect, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
      return { cursor: String(latest), records, removedIds: [], reset: true, unchanged: false };
    }
    const changes = await tx.recoverySheetChange.findMany({ where: { id: { gt: since, lte: latest }, ...(month === null ? {} : { OR: [{ oldMonth: month }, { newMonth: month }] }) }, select: { leadId: true }, distinct: ["leadId"] });
    if (!changes.length) return { cursor: String(latest), records: [], removedIds: [], unchanged: true, reset: false };
    const ids = changes.map(change => change.leadId);
    const records = await tx.recoveryLead.findMany({ where: { ...where, id: { in: ids } }, select: sheetSelect });
    const present = new Set(records.map(row => row.id));
    return { cursor: String(latest), records, removedIds: ids.filter(id => !present.has(id)), reset: false, unchanged: false };
  }, { isolationLevel: "RepeatableRead", maxWait: 15000, timeout: 15000 });
}
