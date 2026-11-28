import { randomUUID } from 'node:crypto';
import { paymentAmount, paymentLinkDescription, linkPayload, razorpayRequest, validateLink } from './razorpay.mjs';
export class LinkChangeError extends Error {
  constructor(status, message, details = {}) { super(message); this.status = status; this.details = details; }
}
export const editablePaymentStatuses = ['discount', 'pay in instalments'];
/**
 * @param {import('@prisma/client').PrismaClient} client
 * @param {import('@prisma/client').Prisma.RecoveryLeadWhereInput | null} [salesScope]
 */
export async function replacePaymentLink(client, config, userId, leadId, desiredAmount, salesScope = null) {
  const amount = typeof desiredAmount === 'string' && desiredAmount.length <= 64 ? paymentAmount(desiredAmount) : null;
  if (amount === null) throw new LinkChangeError(400, 'Enter a valid amount of at least ₹1 with at most two decimal places.');
  const token = randomUUID();
  const ownership = salesScope || { assignedTo: userId };
  const eligible = { id: leadId, ...ownership, paymentStatus: { not: 'paid', mode: 'insensitive' }, ...(!salesScope ? { leadStatus: { in: editablePaymentStatuses, mode: 'insensitive' } } : {}) };
  const lock = await client.recoveryLead.updateMany({ where: { ...eligible, OR: [{ linkChangeUntil: null }, { linkChangeUntil: { lt: new Date() } }] }, data: { linkChangeToken: token, linkChangeUntil: new Date(Date.now() + 120000) } });
  if (!lock.count) {
    const latest = await client.recoveryLead.findFirst({ where: { id: leadId, ...ownership } });
    if (latest?.paymentStatus.trim().toLowerCase() === 'paid') return { id: leadId, remainingAmount: latest.remainingAmount, paymentLinks: latest.paymentLinks, paymentStatus: 'paid', reconciled: true };
    throw new LinkChangeError(409, 'This student must be allocated to you, unpaid, and marked Discount or Pay in instalments. Another link update may also be in progress.');
  }
  let revision;
  let oldCancelled = false;
  try {
    const lead = await client.recoveryLead.findUnique({ where: { id: leadId } });
    // Validate the wording's fee before cancelling any existing unpaid link.
    if (paymentAmount(lead.amountMentioned || '') === null) throw new LinkChangeError(400, 'Program fee is missing or invalid. Correct Amount Mentioned before replacing a link.');
    paymentLinkDescription(lead, amount);
    const current = await client.recoveryPaymentLink.findUnique({ where: { leadId_accountKey: { leadId, accountKey: config.key } } });
    if (current && !current.providerId) throw new LinkChangeError(409, 'The current payment link is still being generated. Let generation finish, then retry.');
    revision = await client.recoveryPaymentRevision.findFirst({ where: { leadId, accountKey: config.key, status: 'pending' } });
    if (lead.paymentLinks && (!current || current.url !== lead.paymentLinks)) throw new LinkChangeError(409, 'This payment link is not managed by the current Razorpay account. Ask the admin to generate a matching link first.');
    const ensureRevision = async () => {
      if (!revision) revision = await client.recoveryPaymentRevision.create({ data: {
        leadId, accountKey: config.key, executiveId: userId, oldRemaining: lead.remainingAmount, oldUrl: lead.paymentLinks,
        oldReference: current?.reference || null, oldProviderId: current?.providerId || null, oldAmountPaise: current?.amountPaise ?? null,
        oldStatus: current?.status || '', desiredAmount: desiredAmount.trim(), amountPaise: BigInt(amount), newReference: randomUUID(),
      } });
    };
    const assertEligible = async () => {
      const live = await client.recoveryLead.findFirst({ where: { ...eligible, linkChangeToken: token, remainingAmount: lead.remainingAmount, paymentLinks: lead.paymentLinks } });
      if (!live) throw new LinkChangeError(409, 'Student allocation, status, or balance changed during the update. No sheet values were overwritten.');
    };
    // Check before every external operation. In-flight requests are reconciled on retry.
    const request = async (path, body) => { await assertEligible(); return razorpayRequest(config, path, body); };
    if (current) {
      let old;
      if (current.providerId) old = await request(`/${encodeURIComponent(current.providerId)}`);
      else {
        const found = await request(`?reference_id=${encodeURIComponent(current.reference)}`);
        if (!Array.isArray(found.payment_links)) throw new LinkChangeError(502, 'Could not reconcile the existing link. Retry this amount.');
        old = found.payment_links.find(link => link.reference_id === current.reference);
      }
      if (old) {
        if (old.reference_id !== current.reference || old.currency !== 'INR' || old.amount !== Number(current.amountPaise) || (current.providerId && old.id !== current.providerId)) throw new LinkChangeError(409, 'Existing link does not match the stored student payment.');
        if (old.status === 'paid') {
          if (old.amount_paid !== old.amount || config.mode !== 'live') throw new LinkChangeError(409, 'This link is already paid. Test payments cannot mark a real recovery paid.');
          const capturedDates = (Array.isArray(old.payments) ? old.payments : []).filter(payment => payment.status === 'captured' && Number.isSafeInteger(payment.created_at) && payment.created_at > 0).map(payment => payment.created_at);
          const timestamp = capturedDates.length ? Math.max(...capturedDates) : old.updated_at;
          if (!Number.isSafeInteger(timestamp) || timestamp <= 0) throw new LinkChangeError(502, 'Payment is confirmed but its date could not be verified. Retry to synchronize.');
          await client.$transaction(async tx => {
            await tx.recoveryPaymentLink.update({ where: { id: current.id }, data: { status: 'paid' } });
            await tx.recoveryLead.updateMany({ where: { id: leadId, ...ownership, linkChangeToken: token, OR: [{ paymentStatus: { not: 'paid', mode: 'insensitive' } }, { paidAt: null }] }, data: { paymentStatus: 'paid', paidAt: new Date(timestamp * 1000) } });
            await tx.recoveryPaymentRevision.updateMany({ where: { leadId, accountKey: config.key, status: 'pending' }, data: { status: 'blocked_paid', oldStatus: 'paid', error: 'Existing link is fully paid. Payment synchronized; replacement was not performed.' } });
          });
          return { id: leadId, remainingAmount: lead.remainingAmount, paymentLinks: lead.paymentLinks, paymentStatus: 'paid', reconciled: true };
        }
        if (old.status === 'partially_paid') throw new LinkChangeError(409, 'Razorpay reports a partial payment. This link cannot be cancelled or replaced; an admin must review the payment.', { code: 'PARTIALLY_PAID' });

        // A fresh amount is safe only while the original link is still unpaid
        // and no replacement creation could have started. Never discard an
        // uncertain creation reference just to bypass a conflict.
        if (revision && (revision.oldRemaining !== lead.remainingAmount || revision.oldUrl !== lead.paymentLinks)) throw new LinkChangeError(409, 'The sheet changed since the unfinished update. An admin must review its saved link history.', { code: 'STALE_REVISION', pendingAmount: revision.desiredAmount });
        if (revision && Number(revision.amountPaise) !== amount) {
          if (old.status === 'created' && !revision.newProviderId && !revision.newUrl) {
            revision = await client.recoveryPaymentRevision.update({ where: { id: revision.id }, data: { desiredAmount: desiredAmount.trim(), amountPaise: BigInt(amount), error: '' } });
          } else throw new LinkChangeError(409, `An unfinished ₹${revision.desiredAmount} update must be completed first. Use that amount to resume safely.`, { code: 'PENDING_REVISION', pendingAmount: revision.desiredAmount });
        }
        await ensureRevision();
        if (old.status === 'created') {
          const cancelled = await request(`/${encodeURIComponent(old.id)}/cancel`, {});
          if (cancelled.id !== old.id || cancelled.status !== 'cancelled') throw new LinkChangeError(502, 'Cancellation could not be confirmed. Retry the same amount.');
          old.status = 'cancelled';
        }
        if (!['cancelled', 'expired'].includes(old.status)) throw new LinkChangeError(409, 'This link cannot be replaced in its current state.');
        oldCancelled = true;
        await client.recoveryPaymentRevision.update({ where: { id: revision.id }, data: { oldProviderId: old.id, oldStatus: old.status } });
        await client.recoveryPaymentLink.updateMany({ where: { id: current.id, status: { not: 'paid' } }, data: { status: old.status } });
      }
    }
    await ensureRevision();
    if (revision.oldRemaining !== lead.remainingAmount || revision.oldUrl !== lead.paymentLinks || Number(revision.amountPaise) !== amount) throw new LinkChangeError(409, `Resume the unfinished ₹${revision.desiredAmount} update first.`, { code: 'PENDING_REVISION', pendingAmount: revision.desiredAmount });
    let next;
    if (revision.newProviderId) next = await request(`/${encodeURIComponent(revision.newProviderId)}`);
    else {
      // The persistent reference handles crashes/timeouts after Razorpay accepted POST.
      const found = await request(`?reference_id=${encodeURIComponent(revision.newReference)}`);
      if (!Array.isArray(found.payment_links)) throw new LinkChangeError(502, 'Could not reconcile the replacement link.');
      next = found.payment_links.find(link => link.reference_id === revision.newReference);
      if (!next) next = await request('', linkPayload(lead, amount, revision.newReference, config.mode));
    }
    validateLink(next, amount, revision.newReference);
    await client.recoveryPaymentRevision.update({ where: { id: revision.id }, data: { newProviderId: next.id, newUrl: next.short_url, newStatus: next.status } });
    await client.$transaction(async tx => {
      const updated = await tx.recoveryLead.updateMany({ where: { ...eligible, linkChangeToken: token, remainingAmount: revision.oldRemaining, paymentLinks: revision.oldUrl }, data: { remainingAmount: revision.desiredAmount, paymentLinks: next.short_url } });
      if (!updated.count) throw new LinkChangeError(409, 'Student changed during replacement. New link is retained in history; sheet was not overwritten.');
      const data = { amountPaise: BigInt(amount), reference: revision.newReference, providerId: next.id, url: next.short_url, status: next.status };
      if (current) await tx.recoveryPaymentLink.update({ where: { id: current.id }, data });
      else await tx.recoveryPaymentLink.create({ data: { leadId, accountKey: config.key, ...data } });
      await tx.recoveryPaymentRevision.update({ where: { id: revision.id }, data: { status: 'completed', error: '' } });
    }, { maxWait: 15000, timeout: 15000 });
    return { id: leadId, remainingAmount: revision.desiredAmount, paymentLinks: next.short_url };
  } catch (error) {
    const message = error instanceof LinkChangeError ? error.message : 'Could not finish replacing the payment link. Retry the same amount to continue safely.';
    if (revision) await client.recoveryPaymentRevision.update({ where: { id: revision.id }, data: { error: message } }).catch(() => {});
    throw new LinkChangeError(error instanceof LinkChangeError ? error.status : 502, oldCancelled ? `${message} The old link is cancelled; retry this amount to finish.` : message, error instanceof LinkChangeError ? error.details : {});
  } finally {
    await client.recoveryLead.updateMany({ where: { id: leadId, linkChangeToken: token }, data: { linkChangeToken: null, linkChangeUntil: null } });
  }
}
