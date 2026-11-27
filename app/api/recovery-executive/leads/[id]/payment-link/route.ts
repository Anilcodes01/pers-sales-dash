import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, apiError, readAdminBody } from "@/lib/auth/http";
import { requireRecoveryRole } from "@/lib/recovery/allocation";
import { paymentConfig } from "@/lib/recovery/payment-links";
import { replacePaymentLink, LinkChangeError } from "@/lib/recovery/replace-payment-link.mjs";
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRecoveryRole("recovery_executive");
    const body = await readAdminBody(request);
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id) || Object.keys(body).length !== 1 || typeof body.remainingAmount !== "string") return json({ error: "Provide a student and remaining amount." }, 400);
    return json(await replacePaymentLink(db(), paymentConfig(), user.id, id, body.remainingAmount));
  } catch (error) {
    if (error instanceof LinkChangeError) return json({ error: error.message, ...error.details }, error.status);
    return apiError(error);
  }
}
