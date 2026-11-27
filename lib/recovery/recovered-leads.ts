import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, apiError } from "@/lib/auth/http";
import { AccessError } from "@/lib/auth/admin-access";
import { requireRecoveryRole, recoveryExecutives } from "./allocation";
import { cachedRecovery } from "./cache";
import { pagedSnapshot } from "./paged-sync";
import { studentPaymentFilter } from "./student-filter";
import { sheetSnapshot } from "./sheet-sync";
export async function recoveredLeads(request: NextRequest, individual: boolean) {
  try {
    const user = await requireRecoveryRole(individual ? "recovery_executive" : "recovery_admin");
    const page = Number(request.nextUrl.searchParams.get("page") || 1);
    if (!Number.isInteger(page) || page < 1 || page > 100000) throw new AccessError(400, "Invalid page.");
    const month = request.nextUrl.searchParams.get("month");
    const scope = individual ? { assignedTo: user.id, paymentStatus: { equals: "paid", mode: "insensitive" as const } } : {};
    const where = { ...scope, ...(!individual ? studentPaymentFilter(request.nextUrl.searchParams.get("status")) : {}), ...(month === null ? {} : { selectedMonth: month }) };
    const client = db();
    const cursor = request.nextUrl.searchParams.get("cursor");
    if (cursor !== null && !/^\d{1,19}$/.test(cursor)) throw new AccessError(400, "Invalid sync cursor.");
    // Admin keeps one month snapshot and filters locally. Subsequent refreshes
    // carry only field patches, including transitions into/out of Paid.
    const snapshot = individual
      ? await pagedSnapshot(client, where, page, cursor, user.id, "paidAt")
      : await sheetSnapshot(client, month, cursor);
    if (cursor !== null) return json(snapshot);
    const fresh = request.nextUrl.searchParams.get("fresh") === "1";
    const [executives, monthRows] = await Promise.all([
      individual ? Promise.resolve([]) : recoveryExecutives(fresh),
      cachedRecovery(`months:recovered:${individual ? user.id : "admin"}`, 60000, () => client.recoveryLead.findMany({ where: scope, distinct: ["selectedMonth"], select: { selectedMonth: true }, orderBy: { selectedMonth: "asc" } }), fresh),
    ]);
    return json({ ...snapshot, executives, months: monthRows.map(row => row.selectedMonth) });
  } catch (error) { return apiError(error); }
}
