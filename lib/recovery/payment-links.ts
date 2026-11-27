import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AccessError } from "@/lib/auth/admin-access";
import { razorpayConfig } from "./razorpay.mjs";
export function paymentConfig() {
  try { return razorpayConfig(); }
  catch (error) { throw new AccessError(503, error instanceof Error ? error.message : "Razorpay keys are missing."); }
}
export async function paymentJobView(id: string, accountKey: string, cursor?: string | null) {
  if (cursor != null && !/^\d{1,19}$/.test(cursor)) throw new AccessError(400, "Invalid progress cursor.");
  return db().$transaction(async client => {
    const job = await client.recoveryPaymentJob.findFirst({ where: { id, accountKey }, select: { id: true, status: true, selectedMonth: true, createdAt: true } });
    if (!job) throw new AccessError(404, "Payment-link job not found.");
    const [state] = await client.$queryRaw<{ latest: bigint }[]>(Prisma.sql`SELECT coalesce(max(id),0) AS latest FROM recovery_payment_item_changes WHERE job_id=${id}::uuid`);
    const since = cursor == null || BigInt(cursor) > state.latest ? state.latest : BigInt(cursor);
    const [counts, updates, issues] = await Promise.all([
      client.recoveryPaymentItem.groupBy({ by: ["status"], where: { jobId: id }, _count: true }),
      since === state.latest ? Promise.resolve([]) : client.$queryRaw<{ leadId: string; url: string }[]>(Prisma.sql`
        SELECT DISTINCT l.id AS "leadId",l.payment_links AS url
        FROM recovery_payment_item_changes c JOIN recovery_payment_items i ON i.id=c.item_id
        JOIN recovery_leads l ON l.id=i.lead_id
        WHERE c.job_id=${id}::uuid AND c.id>${since} AND c.id<=${state.latest} AND i.status IN ('generated','reused')`),
      client.recoveryPaymentItem.findMany({ where: { jobId: id, status: { in: ["failed", "skipped"] } }, select: { id: true, studentName: true, status: true, reason: true }, orderBy: { id: "asc" }, take: 30 }),
    ]);
    return { ...job, cursor: String(state.latest), mode: accountKey.startsWith("rzp_live_") ? "live" : "test", counts: Object.fromEntries(counts.map(group => [group.status, group._count])), total: counts.reduce((total, group) => total + group._count, 0), updates, issues };
  }, { isolationLevel: "RepeatableRead", maxWait: 15000, timeout: 15000 });
}
