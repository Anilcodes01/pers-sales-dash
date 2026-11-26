import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { AccessError } from "@/lib/auth/admin-access";
import { json, apiError, readAdminBody } from "@/lib/auth/http";
import { requireRecoveryRole } from "@/lib/recovery/allocation";
import { paymentStatuses, leadStatuses } from "@/lib/recovery/statuses";
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRecoveryRole("recovery_executive");
    const body = await readAdminBody(request);
    const { id } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AccessError(400, "Invalid student.");
    if (!Object.keys(body).length || Object.keys(body).some(key => key !== "paymentStatus" && key !== "leadStatus" && key !== "comments")) throw new AccessError(400, "Update only payment status, lead status, or comments.");
    const data: { paymentStatus?: string; leadStatus?: string; comments?: string; updatedAt: Date } = { updatedAt: new Date() };
    if ("paymentStatus" in body) {
      if (typeof body.paymentStatus !== "string" || !(paymentStatuses as readonly string[]).includes(body.paymentStatus)) throw new AccessError(400, "Choose unpaid, paid, or default.");
      data.paymentStatus = body.paymentStatus;
    }
    if ("leadStatus" in body) {
      if (typeof body.leadStatus !== "string" || !(leadStatuses as readonly string[]).includes(body.leadStatus)) throw new AccessError(400, "Choose a lead status. Write custom messages in Comments.");
      data.leadStatus = body.leadStatus;
    }
    if ("comments" in body) {
      if (typeof body.comments !== "string" || body.comments.length > 5000) throw new AccessError(400, "Comments must be at most 5,000 characters.");
      data.comments = body.comments;
    }
    // Check assignment in the write itself, including if an admin just reassigned it.
    const result = await db().recoveryLead.updateMany({ where: { id, assignedTo: user.id }, data });
    if (result.count !== 1) throw new AccessError(404, "This student is no longer allocated to you. Refresh your list.");
    return json({ id, ...data });
  } catch (error) { return apiError(error); }
}
