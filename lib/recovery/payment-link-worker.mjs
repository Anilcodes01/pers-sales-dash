import { createPaymentRequestGate, paymentRequestRate, GenerationStopped } from './payment-request-gate.mjs';
import { randomUUID } from 'node:crypto';
import { paymentAmount, linkPayload, razorpayRequest, validateLink, RazorpayError } from './razorpay.mjs';

export function paymentBatchSize(value = process.env.RECOVERY_PAYMENT_CONCURRENCY) {
  const size = Number(value ?? 6);
  return Number.isInteger(size) && size >= 1 && size <= 12 ? size : 6;
}

/** @param {import('@prisma/client').PrismaClient} client */
export async function processPaymentBatch(client, config, jobId) {
  // Recover a stop request if an interrupted worker's lease has expired.
  await client.recoveryPaymentJob.updateMany({
    where: { id: jobId, accountKey: config.key, status: 'stopping', OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] },
    data: { status: 'stopped', lockToken: null, lockedUntil: null },
  });
  const token = randomUUID();
  const now = new Date();
  const claimed = await client.recoveryPaymentJob.updateMany({
    where: { id: jobId, accountKey: config.key, status: 'running', OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockToken: token, lockedUntil: new Date(Date.now() + 120_000) },
  });
  if (!claimed.count) return { processed: 0 };
  let gate;
  try {
    const job = await client.recoveryPaymentJob.findUnique({ where: { id: jobId }, select: { nextRequestAt: true } });
    gate = createPaymentRequestGate({ rate: paymentRequestRate(), nextAt: job?.nextRequestAt?.getTime() || 0,
      canContinue: async () => Boolean(await client.recoveryPaymentJob.findFirst({ where: { id: jobId, accountKey: config.key, status: 'running', lockToken: token }, select: { id: true } })),
    });
    const items = await client.recoveryPaymentItem.findMany({
      where: { jobId, status: { in: ['pending', 'processing'] }, OR: [{ retryAt: null }, { retryAt: { lte: now } }] },
      orderBy: [{ position: 'asc' }, { id: 'asc' }], take: paymentBatchSize(),
      select: { id: true, leadId: true, remainingAmount: true, attempts: true },
    });
    // Prepare students concurrently, but start their first provider requests in
    // sheet order. A slow DB read must not let a lower row jump ahead.
    await processItemsInSheetOrder(items, (item, orderedRequest) => processItem(client, config, item, orderedRequest), gate,
      (path, body) => razorpayRequest(config, path, body));
    const remaining = await client.recoveryPaymentItem.count({ where: { jobId, status: { in: ['pending', 'processing'] } } });
    if (!remaining) await client.recoveryPaymentJob.updateMany({ where: { id: jobId, lockToken: token, status: 'running' }, data: { status: 'completed' } });
    return { processed: items.length };
  } finally {
    await client.recoveryPaymentJob.updateMany({ where: { id: jobId, lockToken: token }, data: { lockToken: null, lockedUntil: null, ...(gate ? { nextRequestAt: new Date(gate.nextAt) } : {}) } });
    await client.recoveryPaymentJob.updateMany({ where: { id: jobId, status: 'stopping', lockToken: null }, data: { status: 'stopped' } });
  }
}

async function processItem(client, config, item, request) {
  const finish = (status, reason, url = '') => client.recoveryPaymentItem.update({ where: { id: item.id }, data: { status, reason, url, retryAt: null } });
  if (item.attempts >= 3) { await finish('failed', 'Retry limit reached. Use Retry failed to reconcile and try again.'); return; }
  await client.recoveryPaymentItem.update({ where: { id: item.id }, data: { status: 'processing', attempts: { increment: 1 } } });
  const leadToken = randomUUID();
  try {
    const leased = await client.recoveryLead.updateMany({
      where: { id: item.leadId, OR: [{ linkChangeUntil: null }, { linkChangeUntil: { lt: new Date() } }] },
      data: { linkChangeToken: leadToken, linkChangeUntil: new Date(Date.now() + 120000) },
    });
    if (!leased.count) throw new RazorpayError('Another link update is in progress. Retrying shortly.', true);
    const [lead, existing] = await Promise.all([
      client.recoveryLead.findUnique({ where: { id: item.leadId }, select: { id: true, studentName: true, studentEmail: true, studentPhone: true, remainingAmount: true, paymentStatus: true, paymentLinks: true } }),
      client.recoveryPaymentLink.findUnique({ where: { leadId_accountKey: { leadId: item.leadId, accountKey: config.key } } }),
    ]);
    if (!lead) { await finish('skipped', 'Student no longer exists.'); return; }
    if (lead.paymentStatus.trim().toLowerCase() === 'paid') { await finish('skipped', 'Student is already marked paid.'); return; }
    const amount = paymentAmount(lead.remainingAmount);
    if (amount === null) { await finish('skipped', 'Remaining amount must be a valid INR amount of at least ₹1.'); return; }
    if (amount !== paymentAmount(item.remainingAmount)) { await finish('skipped', 'Remaining amount changed after generation started.'); return; }
    if (existing && Number(existing.amountPaise) !== amount) { await finish('skipped', 'Amount differs from the existing link. Replacement is not enabled yet.'); return; }
    if (lead.paymentLinks.trim() && (!existing || existing.url !== lead.paymentLinks)) {
      // Switching from test to live is separate from replacing a live balance.
      // Only a tracked test link for this exact student and amount may be superseded.
      const testHistory = config.mode === 'live' ? await client.recoveryPaymentLink.findFirst({
        where: { leadId: lead.id, url: lead.paymentLinks, accountKey: { startsWith: 'rzp_test_' } },
        select: { amountPaise: true },
      }) : null;
      if (!testHistory || Number(testHistory.amountPaise) !== amount) {
        await finish('skipped', 'Student already has a payment link; it was kept unchanged.'); return;
      }
    }
    const record = existing || await client.recoveryPaymentLink.create({ data: {
      leadId: lead.id, accountKey: config.key, amountPaise: BigInt(amount), reference: randomUUID(),
    } });
    let remote;
    let reused = false;
    if (record.providerId) {
      remote = await request(`/${encodeURIComponent(record.providerId)}`);
      reused = true;
    } else {
      // A newly inserted reference cannot have been sent to Razorpay before.
      // Existing records include interrupted attempts and must be reconciled.
      if (existing) {
        const found = await request(`?reference_id=${encodeURIComponent(record.reference)}`);
        if (!Array.isArray(found.payment_links)) throw new RazorpayError('Could not reconcile existing Razorpay links.', true);
        remote = found.payment_links.find(link => link.reference_id === record.reference);
        reused = Boolean(remote);
      }
      if (!remote) remote = await request('', linkPayload(lead, amount, record.reference, config.mode));
    }
    validateLink(remote, amount, record.reference);
    // Always keep the provider record even if the sheet changes during the API request.
    await client.$transaction(async tx => {
      await tx.recoveryPaymentLink.updateMany({ where: { id: record.id, status: { in: ['pending', 'created'] } }, data: { providerId: remote.id, url: remote.short_url, status: remote.status } });
      const updated = await tx.recoveryLead.updateMany({
        where: { id: lead.id, linkChangeToken: leadToken, remainingAmount: lead.remainingAmount, paymentLinks: lead.paymentLinks, paymentStatus: { not: 'paid', mode: 'insensitive' } },
        data: { paymentLinks: remote.short_url },
      });
      await tx.recoveryPaymentItem.update({ where: { id: item.id }, data: {
        status: updated.count ? (reused ? 'reused' : 'generated') : 'skipped',
        reason: updated.count ? '' : 'Student changed while the link was being created. Link retained in history; sheet not overwritten.',
        url: updated.count ? remote.short_url : '', retryAt: null,
      } });
    }, { maxWait: 15_000, timeout: 15_000 });
  } catch (error) {
    if (error instanceof GenerationStopped) {
      await client.recoveryPaymentItem.update({ where: { id: item.id }, data: { status: 'pending', attempts: { decrement: 1 }, retryAt: null } });
      return;
    }
    if (!(error instanceof RazorpayError)) {
      // DB/network failures may follow a successful remote creation; retry via reference lookup.
      await client.recoveryPaymentItem.update({ where: { id: item.id }, data: { status: item.attempts < 2 ? 'pending' : 'failed', reason: 'Generation could not be saved. Retrying will reconcile the existing link first.', retryAt: new Date(Date.now() + 30_000) } });
      return;
    }
    const retry = error.retryable && item.attempts < 2;
    await client.recoveryPaymentItem.update({ where: { id: item.id }, data: { status: retry ? 'pending' : 'failed', reason: error.message, retryAt: retry ? new Date(Date.now() + 30_000) : null } });
  } finally {
    await client.recoveryLead.updateMany({ where: { id: item.leadId, linkChangeToken: leadToken }, data: { linkChangeToken: null, linkChangeUntil: null } });
  }
}

export function processItemsInSheetOrder(items, runItem, gate, send) {
    let previous = Promise.resolve();
  return Promise.all(items.map(item => {
      const turn = previous;
      let release;
      const dispatched = new Promise(resolve => { release = resolve; });
      previous = Promise.all([turn, dispatched]);
      let first = true;
      const orderedRequest = async (path, body) => {
        if (!first) return gate.run(() => send(path, body));
        first = false;
        await turn;
        return gate.run(() => {
          release();
          return send(path, body);
        });
      };
      // Skipped/failed students also release their slot, without bypassing an
      // earlier pending slot. Provider responses may still complete out of order.
      return runItem(item, orderedRequest).finally(() => release());
    }));
}
