import type { NextRequest } from "next/server";
import { salesRecoveryEditAccess } from "@/lib/recovery/sales-edit-access";
import { leadStatuses } from "@/lib/recovery/statuses";
import { apiError, json, readAdminBody } from "@/lib/auth/http";
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, scope } = await salesRecoveryEditAccess();
    const body = await readAdminBody(request);
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id) || Object.keys(body).length !== 1 || typeof body.leadStatus !== "string" || !(leadStatuses as readonly string[]).includes(body.leadStatus)) return json({ error: "Choose a valid lead status." }, 400);
    const result = await client.recoveryLead.updateMany({ where: { id, ...scope, OR: [{ linkChangeUntil: null }, { linkChangeUntil: { lt: new Date() } }] }, data: { leadStatus: body.leadStatus, updatedAt: new Date() } });
    if (result.count !== 1) return json({ error: "Lead is unavailable or a payment-link update is in progress. Refresh and retry." }, 409);
    return json({ id, leadStatus: body.leadStatus });
  } catch (error) { return apiError(error); }
}
