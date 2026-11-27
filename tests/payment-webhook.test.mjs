import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyWebhook, handlePaymentWebhook } from '../lib/recovery/payment-webhook.mjs';
const secret = 'example-webhook-secret';
const event = () => ({ event: 'payment_link.paid', created_at: 1795770000, payload: {
  payment_link: { entity: { id: 'plink_example', reference_id: 'reference', status: 'paid', amount: 500, amount_paid: 500, currency: 'INR', order_id: 'order_example' } },
  payment: { entity: { id: 'pay_example', status: 'captured', captured: true, amount: 500, currency: 'INR', order_id: 'order_example' } },
} });
const raw = value => Buffer.from(JSON.stringify(value));
function fixture() {
  const state = { events: new Map(), tracked: { id: 'stored-link', reference: 'reference', providerId: 'plink_example', amountPaise: 500n, accountKey: 'rzp_live_example', leadId: 'actual-student' }, lead: { paymentStatus: 'unpaid', paidAt: null, amountPaid: '1500', remainingAmount: '5' }, writes: 0 };
  const db = {
    recoveryWebhookEvent: {
      create: async ({ data }) => { if (state.events.has(data.eventId)) throw Object.assign(new Error('Duplicate'), { code: 'P2002' }); state.events.set(data.eventId, data); },
      findUnique: async ({ where }) => state.events.get(where.eventId),
    },
    recoveryPaymentLink: {
      findUnique: async () => state.tracked,
      update: async ({ data }) => { Object.assign(state.tracked, data); },
    },
    recoveryLead: { updateMany: async ({ where, data }) => {
      assert.equal(where.id, 'actual-student');
      assert.deepEqual(Object.keys(data).sort(), ['paidAt', 'paymentStatus']);
      if (state.lead.paymentStatus === 'paid' && state.lead.paidAt) return { count: 0 };
      state.writes++; Object.assign(state.lead, data); return { count: 1 };
    } },
    $transaction: async callback => {
      const saved = { events: new Map(state.events), lead: { ...state.lead }, tracked: state.tracked ? { ...state.tracked } : null, writes: state.writes };
      try { return await callback(db); } catch (error) { Object.assign(state, saved); throw error; }
    },
  };
  return { db, state };
}
test('webhook verifies the exact raw body with the separate signing secret', () => {
  const body = raw(event());
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  verifyWebhook(body, signature, secret);
  assert.throws(() => verifyWebhook(Buffer.concat([body, Buffer.from(' ')]), signature, secret), error => error.status === 401);
  assert.throws(() => verifyWebhook(body, null, secret), error => error.status === 401);
  assert.throws(() => verifyWebhook(body, signature, ''), error => error.status === 503);
});
test('a full live payment marks only Paid and payment date, preserving amount fields', async () => {
  const { db, state } = fixture();
  assert.equal((await handlePaymentWebhook(db, raw(event()), 'evt_1')).paid, true);
  assert.equal(state.lead.paymentStatus, 'paid');
  assert.equal(state.lead.paidAt.toISOString(), new Date(event().created_at * 1000).toISOString());
  assert.equal(state.lead.amountPaid, '1500'); assert.equal(state.lead.remainingAmount, '5');
  assert.equal(state.tracked.status, 'paid');
});
test('duplicate events are idempotent and preserve the original paid date', async () => {
  const { db, state } = fixture(); const body = raw(event());
  await handlePaymentWebhook(db, body, 'evt_1');
  assert.equal((await handlePaymentWebhook(db, body, 'evt_1')).duplicate, true);
  const second = event(); second.created_at++;
  await handlePaymentWebhook(db, raw(second), 'evt_2');
  assert.equal(state.writes, 1);
  assert.equal(state.lead.paidAt.getTime(), event().created_at * 1000);
  await assert.rejects(() => handlePaymentWebhook(db, raw(second), 'evt_1'), error => error.status === 409);
});
test('test payments do not mark students paid in the real recovery sheet', async () => {
  const { db, state } = fixture(); state.tracked.accountKey = 'rzp_test_example';
  assert.equal((await handlePaymentWebhook(db, raw(event()), 'evt_test')).reason, 'test_payment');
  assert.equal(state.writes, 0); assert.equal(state.lead.paymentStatus, 'unpaid');
});
test('unknown links are retryable and roll back deduplication so delivery can recover', async () => {
  const { db, state } = fixture(); state.tracked = null;
  await assert.rejects(() => handlePaymentWebhook(db, raw(event()), 'evt_unknown'), error => error.status === 503);
  assert.equal(state.events.size, 0); assert.equal(state.writes, 0);
});
test('wrong link IDs, stored balances, capture status and currencies cannot mark Paid', async () => {
  for (const change of ['id', 'amount', 'capture', 'currency', 'order']) {
    const { db, state } = fixture(); const value = event();
    if (change === 'id') state.tracked.providerId = 'plink_other';
    if (change === 'amount') state.tracked.amountPaise = 1000n;
    if (change === 'capture') value.payload.payment.entity.captured = false;
    if (change === 'currency') value.payload.payment_link.entity.currency = 'USD';
    if (change === 'order') value.payload.payment.entity.order_id = 'order_other';
    await assert.rejects(() => handlePaymentWebhook(db, raw(value), 'evt_invalid'), error => error.status === 400);
    assert.equal(state.writes, 0); assert.equal(state.events.size, 0);
  }
});
test('partial and unrelated events do not mark paid', async () => {
  const { db, state } = fixture(); const value = event(); value.event = 'payment_link.partially_paid';
  assert.equal((await handlePaymentWebhook(db, raw(value), 'evt_partial')).ignored, true);
  assert.equal(state.writes, 0);
});
