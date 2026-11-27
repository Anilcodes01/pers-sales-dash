import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
export class WebhookError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function verifyWebhook(raw, signature, secret) {
  if (!secret) throw new WebhookError(503, 'Configure RAZORPAY_WEBHOOK_SECRET on the server.');
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) throw new WebhookError(401, 'Invalid webhook signature.');
  const expected = createHmac('sha256', secret).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw new WebhookError(401, 'Invalid webhook signature.');
}
/** @param {import('@prisma/client').PrismaClient} client */
export async function handlePaymentWebhook(client, raw, eventId) {
  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { throw new WebhookError(400, 'Invalid webhook JSON.'); }
  if (!event || typeof event !== 'object') throw new WebhookError(400, 'Invalid webhook event.');
  if (event.event !== 'payment_link.paid') return { received: true, ignored: true };
  if (typeof eventId !== 'string' || !eventId || eventId.length > 255) throw new WebhookError(400, 'Missing or invalid Razorpay event ID.');
  const link = event.payload?.payment_link?.entity;
  const payment = event.payload?.payment?.entity;
  if (!link || !/^plink_[A-Za-z0-9]+$/.test(link.id || '') || typeof link.reference_id !== 'string' || link.status !== 'paid' || link.currency !== 'INR' || !Number.isSafeInteger(link.amount) || link.amount <= 0 || link.amount_paid !== link.amount || !payment || payment.status !== 'captured' || payment.captured !== true || payment.currency !== 'INR' || payment.amount !== link.amount || !Number.isSafeInteger(event.created_at) || event.created_at <= 0) throw new WebhookError(400, 'Expected a fully paid INR payment link with a captured payment.');
  if (link.order_id && payment.order_id !== link.order_id) throw new WebhookError(400, 'Payment does not belong to this link.');
  const payloadHash = createHash('sha256').update(raw).digest('hex');
  try {
    return await client.$transaction(async tx => {
      // Insert and payment update commit together; a failed write remains retryable.
      await tx.recoveryWebhookEvent.create({ data: { eventId, payloadHash, providerLinkId: link.id, eventType: event.event } });
      const tracked = await tx.recoveryPaymentLink.findUnique({ where: { reference: link.reference_id } });
      if (!tracked) throw new WebhookError(503, 'Payment link is not stored yet. Retry this webhook.');
      if ((tracked.providerId && tracked.providerId !== link.id) || Number(tracked.amountPaise) !== link.amount) throw new WebhookError(400, 'Payment does not match the stored payment link.');
      if (!tracked.accountKey.startsWith('rzp_live_')) return { received: true, ignored: true, reason: 'test_payment' };
      await tx.recoveryPaymentLink.update({ where: { id: tracked.id }, data: { providerId: link.id, status: 'paid' } });
      await tx.recoveryLead.updateMany({
        where: { id: tracked.leadId, OR: [{ paymentStatus: { not: 'paid', mode: 'insensitive' } }, { paidAt: null }] },
        // Deliberately do not update amountPaid or remainingAmount.
        data: { paymentStatus: 'paid', paidAt: new Date(event.created_at * 1000) },
      });
      return { received: true, paid: true };
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      const existing = await client.recoveryWebhookEvent.findUnique({ where: { eventId } });
      if (existing?.payloadHash === payloadHash) return { received: true, duplicate: true };
      if (existing) throw new WebhookError(409, 'Event ID was already used with a different payload.');
    }
    throw error;
  }
}
