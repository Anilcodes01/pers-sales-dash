import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replacePaymentLink } from '../lib/recovery/replace-payment-link.mjs';
const config = { key: 'rzp_live_example', secret: 'secret', mode: 'live' };
const oldRemote = () => ({ id: 'plink_old', reference_id: 'old-reference', amount: 300000, currency: 'INR', status: 'created', short_url: 'https://rzp.io/i/old' });
function fixture(changes = {}) {
  const state = {
    lead: { id: 'student', assignedTo: 'executive', leadStatus: 'discount', paymentStatus: 'unpaid', remainingAmount: '3000', paymentLinks: 'https://rzp.io/i/old', amountMentioned: '4500', amountPaid: '1000', studentName: 'Student', studentEmail: '', studentPhone: '', linkChangeToken: null, linkChangeUntil: null, ...changes },
    current: { id: 'record', providerId: 'plink_old', reference: 'old-reference', amountPaise: 300000n, status: 'created', url: 'https://rzp.io/i/old' },
    revision: null, old: oldRemote(), next: null, posts: 0, cancels: 0,
  };
  function matches(where) {
    const row = state.lead;
    if (where.assignedTo && row.assignedTo !== where.assignedTo) return false;
    if (where.paymentStatus && row.paymentStatus === 'paid') return false;
    if (where.leadStatus && !where.leadStatus.in.includes(row.leadStatus)) return false;
    for (const key of ['linkChangeToken', 'remainingAmount', 'paymentLinks']) if (key in where && row[key] !== where[key]) return false;
    if (where.OR?.some(part => 'linkChangeUntil' in part) && row.linkChangeUntil && row.linkChangeUntil > new Date()) return false;
    if (where.OR?.some(part => 'paymentStatus' in part) && row.paymentStatus === 'paid' && row.paidAt) return false;
    return true;
  }
  const db = {
    recoveryLead: {
      updateMany: async ({ where, data }) => { if (!matches(where)) return { count: 0 }; Object.assign(state.lead, data); return { count: 1 }; },
      findUnique: async () => ({ ...state.lead }),
      findFirst: async ({ where }) => matches(where) ? { ...state.lead } : null,
    },
    recoveryPaymentLink: {
      findUnique: async () => state.current ? { ...state.current } : null,
      updateMany: async ({ data }) => { Object.assign(state.current, data); return { count: 1 }; },
      update: async ({ data }) => { Object.assign(state.current, data); return state.current; },
      create: async ({ data }) => { state.current = { id: 'record', ...data }; return state.current; },
    },
    recoveryPaymentRevision: {
      findFirst: async () => state.revision?.status === 'pending' ? { ...state.revision } : null,
      create: async ({ data }) => { state.revision = { id: 'revision', newProviderId: null, status: 'pending', ...data }; return { ...state.revision }; },
      update: async ({ data }) => { Object.assign(state.revision, data); return state.revision; },
      updateMany: async ({ data }) => { if (state.revision) Object.assign(state.revision, data); return { count: state.revision ? 1 : 0 }; },
    },
    $transaction: async callback => {
      const copy = { lead: { ...state.lead }, current: { ...state.current }, revision: { ...state.revision } };
      try { return await callback(db); } catch (error) { Object.assign(state, copy); throw error; }
    },
  };
  const fetcher = async (url, options) => {
    let result;
    if (url.endsWith('/plink_old/cancel')) { state.cancels++; state.old.status = 'cancelled'; result = state.old; }
    else if (url.endsWith('/plink_old')) result = state.old;
    else if (url.includes('?reference_id=')) result = { payment_links: state.next ? [state.next] : [] };
    else if (url.endsWith('/plink_new')) result = state.next;
    else {
      state.posts++; const body = JSON.parse(options.body);
      assert.equal(body.options.checkout.method.upi, true);
      state.next = { id: 'plink_new', reference_id: body.reference_id, amount: body.amount, currency: 'INR', status: 'created', short_url: 'https://rzp.io/i/new' };
      result = state.next;
    }
    return new Response(JSON.stringify(result), { status: 200 });
  };
  return { state, db, fetcher };
}
async function mock(fetcher, run) { const previous = globalThis.fetch; globalThis.fetch = fetcher; try { return await run(); } finally { globalThis.fetch = previous; } }
test('Discount replacement cancels the old link, saves a new amount and link, and retains history', async () => {
  const { state, db, fetcher } = fixture();
  const result = await mock(fetcher, () => replacePaymentLink(db, config, 'executive', 'student', '2500'));
  assert.equal(result.paymentLinks, 'https://rzp.io/i/new'); assert.equal(state.lead.remainingAmount, '2500');
  assert.equal(state.lead.amountPaid, '1000'); assert.equal(state.lead.paymentStatus, 'unpaid');
  assert.equal(state.cancels, 1); assert.equal(state.posts, 1);
  assert.equal(state.revision.oldReference, 'old-reference'); assert.equal(state.revision.oldStatus, 'cancelled');
  assert.equal(state.revision.status, 'completed'); assert.equal(state.lead.linkChangeToken, null);
});
test('instalment amount becomes the full amount requested by the replacement link', async () => {
  const { state, db, fetcher } = fixture({ leadStatus: 'pay in instalments' });
  await mock(fetcher, () => replacePaymentLink(db, config, 'executive', 'student', '500.25'));
  assert.equal(state.next.amount, 50025); assert.equal(state.lead.remainingAmount, '500.25');
});
test('wrong executive, unsupported status, Paid, and invalid amounts cannot call Razorpay', async () => {
  for (const row of [{ assignedTo: 'other' }, { leadStatus: 'called' }]) {
    const { db } = fixture(row);
    await mock(() => assert.fail('Unauthorized provider call'), () => assert.rejects(() => replacePaymentLink(db, config, 'executive', 'student', '1000'), error => error.status === 409));
  }
  const { db } = fixture();
  await assert.rejects(() => replacePaymentLink(db, config, 'executive', 'student', '-1'), error => error.status === 400);
});
test('provider-paid and partially-paid links are never cancelled', async () => {
  for (const status of ['paid', 'partially_paid']) {
    const { state, db, fetcher } = fixture(); state.old.status = status;
    await mock(fetcher, () => assert.rejects(() => replacePaymentLink(db, config, 'executive', 'student', '1000'), error => error.status === 409));
    assert.equal(state.cancels, 0); assert.equal(state.posts, 0); assert.equal(state.lead.remainingAmount, '3000');
  }
});
test('timeout after creation is reconciled on retry with no duplicate creation', async () => {
  const { state, db, fetcher } = fixture();
  await mock(async (url, options) => {
    const response = await fetcher(url, options);
    if (options.method === 'POST' && !url.endsWith('/cancel')) throw new Error('response lost');
    return response;
  }, () => assert.rejects(() => replacePaymentLink(db, config, 'executive', 'student', '2000'), /old link is cancelled/));
  assert.equal(state.lead.remainingAmount, '3000'); assert.equal(state.revision.status, 'pending');
  await mock(fetcher, () => replacePaymentLink(db, config, 'executive', 'student', '2000'));
  assert.equal(state.posts, 1); assert.equal(state.cancels, 1); assert.equal(state.lead.remainingAmount, '2000');
});
test('a student reassigned during replacement is not overwritten', async () => {
  const { state, db, fetcher } = fixture();
  await mock(async (url, options) => {
    const response = await fetcher(url, options);
    if (options.method === 'POST' && !url.endsWith('/cancel')) state.lead.assignedTo = 'another';
    return response;
  }, () => assert.rejects(() => replacePaymentLink(db, config, 'executive', 'student', '2000'), /not overwritten/));
  assert.equal(state.lead.remainingAmount, '3000'); assert.equal(state.revision.newUrl, 'https://rzp.io/i/new');
});

test('a provider-confirmed full payment reconciles stale Paid status before any pending-amount conflict', async () => {
  const { state, db, fetcher } = fixture();
  state.old.status = 'paid'; state.old.amount_paid = state.old.amount;
  state.old.payments = [{ status: 'captured', created_at: 1795776536 }];
  state.revision = { id: 'revision', status: 'pending', oldRemaining: '3000', oldUrl: state.lead.paymentLinks, amountPaise: 800n, desiredAmount: '8' };
  const result = await mock(fetcher, () => replacePaymentLink(db, config, 'executive', 'student', '30'));
  assert.equal(result.reconciled, true); assert.equal(result.paymentStatus, 'paid');
  assert.equal(state.lead.paymentStatus, 'paid'); assert.ok(state.lead.paidAt);
  assert.equal(state.lead.remainingAmount, '3000'); assert.equal(state.lead.amountPaid, '1000');
  assert.equal(state.revision.status, 'blocked_paid'); assert.equal(state.cancels, 0); assert.equal(state.posts, 0);
});
test('an unfinished untouched link update can safely adopt a new requested amount', async () => {
  const { state, db, fetcher } = fixture();
  state.revision = { id: 'revision', status: 'pending', oldRemaining: '3000', oldUrl: state.lead.paymentLinks, amountPaise: 800n, desiredAmount: '8', newReference: 'existing-reference', newProviderId: null, newUrl: '' };
  await mock(fetcher, () => replacePaymentLink(db, config, 'executive', 'student', '30'));
  assert.equal(state.lead.remainingAmount, '30'); assert.equal(state.next.amount, 3000);
  assert.equal(state.posts, 1); assert.equal(state.cancels, 1);
});
test('an uncertain creation is not discarded when a different amount is entered', async () => {
  const { state, db, fetcher } = fixture();
  state.old.status = 'cancelled';
  state.revision = { id: 'revision', status: 'pending', oldRemaining: '3000', oldUrl: state.lead.paymentLinks, amountPaise: 800n, desiredAmount: '8', newReference: 'existing-reference', newProviderId: null, newUrl: '' };
  await mock(fetcher, () => assert.rejects(() => replacePaymentLink(db, config, 'executive', 'student', '30'), error => error.status === 409 && error.details.pendingAmount === '8'));
  assert.equal(state.posts, 0); assert.equal(state.lead.remainingAmount, '3000');
});

test('a webhook that marked Paid just before Save refreshes the row instead of reporting a conflict', async () => {
  const { state, db } = fixture({ paymentStatus: 'paid' });
  const result = await mock(() => assert.fail('Paid row must not call Razorpay'), () => replacePaymentLink(db, config, 'executive', 'student', '30'));
  assert.equal(result.paymentStatus, 'paid'); assert.equal(result.reconciled, true);
  assert.equal(state.lead.remainingAmount, '3000');
});

test('a missing program fee cannot cancel an existing link or create a replacement', async () => {
  const { state, db } = fixture({ amountMentioned: '' });
  await assert.rejects(() => replacePaymentLink(db, config, 'executive', 'student', '2000'), /Program fee/);
  assert.equal(state.cancels, 0); assert.equal(state.posts, 0);
});
