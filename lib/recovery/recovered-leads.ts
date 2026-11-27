import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, apiError } from "@/lib/auth/http";
import { AccessError } from "@/lib/auth/admin-access";
import { requireRecoveryRole, recoveryExecutives } from "./allocation";
export async function recoveredLeads(request: NextRequest, individual: boolean) {
  try {
    const user = await requireRecoveryRole(individual ? "recovery_executive" : "recovery_admin");
    const page = Number(request.nextUrl.searchParams.get("page") || 1);
    if (!Number.isInteger(page) || page < 1 || page > 100000) throw new AccessError(400, "Invalid page.");
    const month = request.nextUrl.searchParams.get("month");
    const scope = { paymentStatus: { equals: "paid", mode: "insensitive" as const }, ...(individual ? { assignedTo: user.id } : {}) };
    const where = { ...scope, ...(month === null ? {} : { selectedMonth: month }) };
    const client = db();
    const [[records, total], executives, monthRows] = await Promise.all([
      client.$transaction([
        client.recoveryLead.findMany({ where, orderBy: [{ paidAt: { sort: "desc", nulls: "last" } }, { id: "asc" }], skip: (page - 1) * 25, take: 25 }),
        client.recoveryLead.count({ where }),
      ]),
      individual ? Promise.resolve([]) : recoveryExecutives(),
      client.recoveryLead.findMany({ where: scope, distinct: ["selectedMonth"], select: { selectedMonth: true }, orderBy: { selectedMonth: "asc" } }),
    ]);
    return json({ records, total, executives, months: monthRows.map(row => row.selectedMonth), page, hasMore: page * 25 < total });
  } catch (error) { return apiError(error); }
}
