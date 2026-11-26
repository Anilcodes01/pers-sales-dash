import "server-only";
import { currentUser } from "@/lib/auth/session";
import { AccessError } from "@/lib/auth/admin-access";
import { db } from "@/lib/db";
import type { CsvRow } from "./csv";
export type SalesRole = "sales_executive" | "team_leader";
export async function requireSalesUser(role: SalesRole) {
  const user = await currentUser();
  if (!user) throw new AccessError(401, "Sign in to continue.");
  if (user.app_metadata.role !== role) throw new AccessError(403, "You do not have access to this sales workspace.");
  return user;
}
export async function importSales(ownerId: string, month: Date, filename: string, rows: CsvRow[]) {
  return db().$transaction(async tx => {
    const batch = await tx.salesImport.create({ data: { ownerId, reportingMonth: month, filename, rowCount: 0 } });
    const result = await tx.salesRecord.createMany({ data: rows.map(({ dateFromCsv, ...row }) => ({ ...row, dateFromCsv: dateFromCsv ? new Date(`${dateFromCsv}T00:00:00.000Z`) : null, ownerId, reportingMonth: month, importId: batch.id })), skipDuplicates: true });
    await tx.salesImport.update({ where: { id: batch.id }, data: { rowCount: result.count } });
    return { imported: result.count, skipped: rows.length - result.count, importId: batch.id };
  }, { maxWait: 5000, timeout: 20000 });
}
export async function listSales(ownerId: string, month: Date, page: number) {
  const where = { ownerId, reportingMonth: month };
  const [records, total] = await db().$transaction([
    db().salesRecord.findMany({ where, orderBy: [{ dateFromCsv: "desc" }, { id: "asc" }], skip: (page - 1) * 25, take: 25, select: { id: true, dateFromCsv: true, name: true, college: true, emailId: true, phone: true, whatsapp: true, programPlan: true, totalAmountPaise: true, registrationAmountPaise: true, comments: true, rawValues: true, createdAt: true, updatedAt: true } }),
    db().salesRecord.count({ where }),
  ]);
  return { records, total, page, hasMore: page * 25 < total };
}
