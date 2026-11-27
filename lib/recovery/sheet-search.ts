import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, apiError } from "@/lib/auth/http";
import { AccessError } from "@/lib/auth/admin-access";
import { requireRecoveryRole } from "./allocation";
import { leadColumns } from "./columns";
import { studentPaymentFilter } from "./student-filter";
export async function sheetSearch(request: NextRequest, individual: boolean) {
  try {
    const user = await requireRecoveryRole(individual ? "recovery_executive" : "recovery_admin");
    const scope = request.nextUrl.searchParams.get("scope");
    if (scope !== "recovered" && (scope !== "leads" || individual)) throw new AccessError(400, "Invalid sheet.");
    const q = (request.nextUrl.searchParams.get("q") || "").trim();
    if (q.length > 200) throw new AccessError(400, "Search up to 200 characters.");
    if (!q) return json({ matches: [] });
    const month = request.nextUrl.searchParams.get("month");
    const where = { ...(individual ? { assignedTo: user.id } : {}), ...(scope === "recovered" ? { ...(!individual ? studentPaymentFilter(request.nextUrl.searchParams.get("status")) : { paymentStatus: { equals: "paid", mode: "insensitive" as const } }), ...(month === null ? {} : { selectedMonth: month }) } : {}) };
    const orderBy = scope === "recovered" && individual ? [{ paidAt: { sort: "desc" as const, nulls: "last" as const } }, { id: "asc" as const }] : [{ createdAt: "desc" as const }, { id: "asc" as const }];
    const client = db();
    const [ordered, matched] = await client.$transaction([
      client.recoveryLead.findMany({ where, orderBy, select: { id: true } }),
      client.recoveryLead.findMany({ where: { ...where, OR: Object.keys(leadColumns).map(field => ({ [field]: { contains: q, mode: "insensitive" } })) }, select: { id: true } }),
    ], { isolationLevel: "RepeatableRead" });
    const ids = new Set(matched.map(row => row.id));
    return json({ matches: ordered.flatMap((row, index) => ids.has(row.id) ? [{ id: row.id, index, page: Math.floor(index / 25) + 1 }] : []) });
  } catch (error) { return apiError(error); }
}
