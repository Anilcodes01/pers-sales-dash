import "server-only";
import { db } from "@/lib/db";
import { AccessError } from "@/lib/auth/admin-access";
import { razorpayConfig } from "./razorpay.mjs";
export function paymentConfig() {
  try { return razorpayConfig(); }
  catch (error) { throw new AccessError(503, error instanceof Error ? error.message : "Razorpay keys are missing."); }
}
export async function paymentJobView(id: string, accountKey: string) {
  const client = db();
  const job = await client.recoveryPaymentJob.findFirst({ where: { id, accountKey }, select: { id: true, status: true, selectedMonth: true, createdAt: true } });
  if (!job) throw new AccessError(404, "Payment-link job not found.");
  const [counts, updates, issues] = await Promise.all([
    client.recoveryPaymentItem.groupBy({ by: ["status"], where: { jobId: id }, _count: true }),
    client.recoveryPaymentItem.findMany({ where: { jobId: id, status: { in: ["generated", "reused"] } }, select: { leadId: true, url: true } }),
    client.recoveryPaymentItem.findMany({ where: { jobId: id, status: { in: ["failed", "skipped"] } }, select: { id: true, studentName: true, status: true, reason: true }, orderBy: { id: "asc" }, take: 30 }),
  ]);
  // A completed generation item may point to a link superseded by an executive.
  // Publish the current sheet URL, keeping historical job outcomes untouched.
  const currentRows = updates.length ? await client.recoveryLead.findMany({ where: { id: { in: updates.map(update => update.leadId) } }, select: { id: true, paymentLinks: true } }) : [];
  const currentLinks = currentRows.map(row => ({ leadId: row.id, url: row.paymentLinks }));
  return { ...job, mode: accountKey.startsWith("rzp_live_") ? "live" : "test", counts: Object.fromEntries(counts.map(group => [group.status, group._count])), total: counts.reduce((total, group) => total + group._count, 0), updates: currentLinks, issues };
}
