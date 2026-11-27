import { after, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireRecoveryRole } from "@/lib/recovery/allocation";
import { json, apiError, readAdminBody } from "@/lib/auth/http";
import { AccessError } from "@/lib/auth/admin-access";
import { paymentConfig, paymentJobView } from "@/lib/recovery/payment-links";
import { processPaymentBatch } from "@/lib/recovery/payment-link-worker.mjs";
export async function GET(request: NextRequest) {
  try {
    await requireRecoveryRole("recovery_admin");
    const config = paymentConfig();
    const month = request.nextUrl.searchParams.get("month");
    const active = await db().recoveryPaymentJob.findFirst({ where: { accountKey: config.key, status: { in: ["running", "stopping"] } } });
    const job = active || await db().recoveryPaymentJob.findFirst({ where: { accountKey: config.key, selectedMonth: month }, orderBy: { createdAt: "desc" } });
    return json({ mode: config.mode, job: job ? await paymentJobView(job.id, config.key) : null });
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const user = await requireRecoveryRole("recovery_admin");
    const body = await readAdminBody(request);
    const config = paymentConfig();
    const client = db();
    if (body.action === "start") {
      if (body.month !== null && (typeof body.month !== "string" || body.month.length > 10000)) throw new AccessError(400, "Select a month.");
      let job = await client.recoveryPaymentJob.findFirst({ where: { accountKey: config.key, status: { in: ["running", "stopping"] } } });
      if (!job) {
        const rows = await client.recoveryLead.findMany({ where: body.month === null ? {} : { selectedMonth: body.month as string }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, studentName: true, remainingAmount: true } });
        if (!rows.length) throw new AccessError(400, "No students in this month selection.");
        try {
          job = await client.recoveryPaymentJob.create({ data: { accountKey: config.key, createdBy: user.id, selectedMonth: body.month as string | null,
            items: { createMany: { data: rows.map((row, position) => ({ position, leadId: row.id, studentName: row.studentName, remainingAmount: row.remainingAmount })) } },
          } });
        } catch (error) {
          if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
          job = await client.recoveryPaymentJob.findFirst({ where: { accountKey: config.key, status: { in: ["running", "stopping"] } } });
          if (!job) throw error;
        }
      }
      const jobId = job.id;
      // Kick off one bounded batch; the page or standalone worker drains the durable queue.
      after(async () => { try { await processPaymentBatch(client, config, jobId); } catch { /* Job remains resumable. */ } });
      return json({ job: await paymentJobView(job.id, config.key) });
    }
    if (body.action !== "process" && body.action !== "retry" && body.action !== "stop" && body.action !== "resume") throw new AccessError(400, "Choose a payment-link action.");
    if (typeof body.jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.jobId)) throw new AccessError(400, "Invalid job.");
    const job = await client.recoveryPaymentJob.findFirst({ where: { id: body.jobId, accountKey: config.key } });
    if (!job) throw new AccessError(404, "Payment-link job not found.");
    if (body.action === "stop") {
      await client.recoveryPaymentJob.updateMany({ where: { id: job.id, accountKey: config.key, status: "running" }, data: { status: "stopping" } });
      // No active worker means stopping can finish immediately.
      await client.recoveryPaymentJob.updateMany({ where: { id: job.id, status: "stopping", OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] }, data: { status: "stopped", lockToken: null, lockedUntil: null } });
      return json({ job: await paymentJobView(job.id, config.key) });
    }
    if (body.action === "resume") {
      const resumed = await client.recoveryPaymentJob.updateMany({ where: { id: job.id, status: "stopped" }, data: { status: "running" } });
      if (!resumed.count) throw new AccessError(409, "This job is not stopped. Refresh its progress.");
    }
    if (body.action === "retry") {
      if (job.status !== "completed") throw new AccessError(409, "Wait for the current job to finish before retrying.");
      await client.$transaction(async tx => {
        await tx.recoveryPaymentJob.update({ where: { id: job.id }, data: { status: "running" } });
        await tx.recoveryPaymentItem.updateMany({ where: { jobId: job.id, status: "failed" }, data: { status: "pending", attempts: 0, retryAt: null, reason: "" } });
      });
    }
    await processPaymentBatch(client, config, job.id);
    return json({ job: await paymentJobView(job.id, config.key) });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return json({ error: "Another generation job is already active. Refresh to see its progress." }, 409);
    return apiError(error);
  }
}
