import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { AccessError } from "@/lib/auth/admin-access";
import { json, apiError, readAdminBody } from "@/lib/auth/http";
import { requireRecoveryRole, allocateLeads } from "@/lib/recovery/allocation";
export async function GET(request: NextRequest) {
  try {
    await requireRecoveryRole("recovery_admin");
    const month = request.nextUrl.searchParams.get("month");
    if (month === null) throw new AccessError(400, "Select a month.");
    const client = db(); const where = { selectedMonth: month };
    const [records, total] = await client.$transaction([
      client.recoveryLead.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }),
      client.recoveryLead.count({ where }),
    ]);
    return json({ records, total });
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try { const user = await requireRecoveryRole("recovery_admin"); return json(await allocateLeads(user.id, await readAdminBody(request, 1024 * 1024))); }
  catch (error) { return apiError(error); }
}
