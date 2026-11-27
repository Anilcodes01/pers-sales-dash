import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { AccessError } from "@/lib/auth/admin-access";
import { json, apiError, readAdminBody } from "@/lib/auth/http";
import { requireRecoveryRole } from "@/lib/recovery/allocation";
import { paymentStatuses, leadStatuses } from "@/lib/recovery/statuses";
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const started = performance.now();
  let authMs = 0;
  let dbMs = 0;
  const timed = (response: ReturnType<typeof json>) => {
    response.headers.set("Server-Timing", `auth;dur=${authMs.toFixed(1)}, db;dur=${dbMs.toFixed(1)}, total;dur=${(performance.now() - started).toFixed(1)}`);
    return response;
  };
  try {
    await requireRecoveryRole("recovery_admin");
    authMs = performance.now() - started;
    const body = await readAdminBody(request);
    const { id } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AccessError(400, "Invalid student.");
    if (!Object.keys(body).length || Object.keys(body).some(key => key !== "paymentStatus" && key !== "leadStatus" && key !== "paymentLinks")) throw new AccessError(400, "Update only payment status, lead status, or payment link.");
    const data: { paymentStatus?: string; leadStatus?: string; paymentLinks?: string; updatedAt: Date; paidAt?: Date | null } = { updatedAt: new Date() };
    if ("paymentStatus" in body) {
      if (typeof body.paymentStatus !== "string" || !(paymentStatuses as readonly string[]).includes(body.paymentStatus)) throw new AccessError(400, "Choose unpaid, paid, or default.");
      data.paymentStatus = body.paymentStatus;
    }
    if ("leadStatus" in body) {
      if (typeof body.leadStatus !== "string" || !(leadStatuses as readonly string[]).includes(body.leadStatus)) throw new AccessError(400, "Choose a lead status. Write custom messages in Comments.");
      data.leadStatus = body.leadStatus;
    }
    if ("paymentLinks" in body) {
      if (typeof body.paymentLinks !== "string" || body.paymentLinks.length > 2048) throw new AccessError(400, "Payment link must be a URL up to 2,048 characters, or blank.");
      const value = body.paymentLinks.trim();
      if (value) {
        let url;
        try { url = new URL(value); } catch { throw new AccessError(400, "Enter a valid HTTPS payment link."); }
        if (url.protocol !== "https:" || url.username || url.password) throw new AccessError(400, "Enter a valid HTTPS payment link without embedded credentials.");
      }
      data.paymentLinks = value;
    }
    if (data.leadStatus === "ca") data.paymentStatus = "paid";
    const client = db();
    const where = { id, ...(data.paymentLinks !== undefined ? { OR: [{ linkChangeUntil: null }, { linkChangeUntil: { lt: new Date() } }] } : {}) };
    const dbStarted = performance.now();
    let result;
    if (data.paymentStatus === "paid") {
      data.paidAt = new Date();
      result = await client.recoveryLead.updateMany({ where: { ...where, paymentStatus: { not: "paid", mode: "insensitive" } }, data });
      if (!result.count) {
        // An already-paid record keeps its recovery date, including an unknown legacy date.
        delete data.paidAt;
        result = await client.recoveryLead.updateMany({ where: { ...where, paymentStatus: { equals: "paid", mode: "insensitive" } }, data });
      }
    } else {
      if (data.paymentStatus !== undefined) data.paidAt = null;
      result = await client.recoveryLead.updateMany({ where, data });
    }
    dbMs = performance.now() - dbStarted;
    if (result.count !== 1) throw new AccessError(data.paymentLinks !== undefined ? 409 : 404, data.paymentLinks !== undefined ? "Student not found or a payment-link update is in progress. Refresh and retry." : "Student not found. Refresh your list.");
    return timed(json({ id, ...data }));
  } catch (error) { return timed(apiError(error)); }
}
