import { test } from 'node:test';
import assert from 'node:assert/strict';
import { razorpayConfig, paymentAmount, paymentLinkDescription, linkPayload, validateLink, razorpayRequest, RazorpayError } from '../lib/recovery/razorpay.mjs';
import { createPaymentRequestGate, paymentRequestRate, GenerationStopped } from '../lib/recovery/payment-request-gate.mjs';
import { processPaymentBatch, paymentBatchSize, processItemsInSheetOrder } from '../lib/recovery/payment-link-worker.mjs';
const config = { key: 'rzp_test_example', secret: 'secret', mode: 'test' };
const lead = { id: 'student-1', studentName: 'Example Student', studentPhone: '9876543210', studentEmail: 'student@example.com', amountMentioned: '4500', remainingAmount: '1,500', paymentLinks: '', paymentStatus: 'unpaid' };
const remote = reference => ({ id: 'plink_example', amount: 150000, currency: 'INR', status: 'created', reference_id: reference, short_url: 'https://rzp.io/i/example' });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
function fixture(overrides = {}) {
  const state = { lead: { ...lead, ...overrides }, item: { id: 'item-1', jobId: 'job-1', leadId: lead.id, remainingAmount: lead.remainingAmount, attempts: 0, status: 'pending', retryAt: null }, link: null, locked: false, jobStatus: 'running', nextRequestAt: null, done: false, writes: 0 };
  const db = {
    recoveryPaymentJob: {
      findUnique: async () => ({ nextRequestAt: state.nextRequestAt }),
      findFirst: async ({ where }) => state.jobStatus === where.status && state.locked ? { id: 'job-1' } : null,
      updateMany: async ({ where, data }) => {
      if (where.status && where.status !== state.jobStatus) return { count: 0 };
      if (where.status === 'stopping' && where.OR && state.locked) return { count: 0 };
      if (where.lockToken === null && state.locked) return { count: 0 };
      if (data.status) state.jobStatus = data.status;
      if (data.nextRequestAt) state.nextRequestAt = data.nextRequestAt;
      if (data.lockToken) { if (state.locked || where.accountKey !== config.key) return { count: 0 }; state.locked = true; }
      if (data.status === 'completed') state.done = true;
      if (data.lockToken === null) state.locked = false;
      return { count: 1 };
    } },
    recoveryPaymentItem: {
      findMany: async () => ['pending', 'processing'].includes(state.item.status) && (!state.item.retryAt || state.item.retryAt <= new Date()) ? [{ ...state.item }] : [],
      update: async ({ data }) => { const attempts = state.item.attempts + (data.attempts?.increment || 0) - (data.attempts?.decrement || 0); Object.assign(state.item, data, { attempts }); return state.item; },
      count: async () => ['pending', 'processing'].includes(state.item.status) ? 1 : 0,
    },
    recoveryLead: {
      findUnique: async () => state.lead ? { ...state.lead } : null,
      updateMany: async ({ where, data }) => {
        assert.equal(where.id, lead.id);
        if ('linkChangeUntil' in data) {
          if (where.linkChangeToken && state.lead.linkChangeToken !== where.linkChangeToken) return { count: 0 };
          if (where.OR && state.lead.linkChangeUntil && state.lead.linkChangeUntil > new Date()) return { count: 0 };
          Object.assign(state.lead, data); return { count: 1 };
        }
        if (state.lead.remainingAmount !== where.remainingAmount || state.lead.paymentLinks !== where.paymentLinks || state.lead.paymentStatus.toLowerCase() === 'paid') return { count: 0 };
        Object.assign(state.lead, data); state.writes++; return { count: 1 };
      },
    },
    recoveryPaymentLink: {
      findUnique: async () => state.link,
      findFirst: async () => state.testHistory || null,
      create: async ({ data }) => { state.link = { id: 'record-1', providerId: null, url: '', ...data }; return state.link; },
      update: async ({ data }) => { Object.assign(state.link, data); return state.link; },
      updateMany: async ({ data }) => { Object.assign(state.link, data); return { count: 1 }; },
    },
    $transaction: async callback => callback(db),
  };
  return { db, state };
}
async function mockedFetch(fn, work) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  try { await work(); } finally { globalThis.fetch = original; }
}
test('configuration accepts complete test/live credentials and derives the mode', () => {
  assert.deepEqual(razorpayConfig({ RAZORPAY_KEY_ID: config.key, RAZORPAY_KEY_SECRET: config.secret }), config);
  assert.equal(razorpayConfig({ RAZORPAY_KEY_ID: 'rzp_live_example', RAZORPAY_KEY_SECRET: 'secret' }).mode, 'live');
  assert.throws(() => razorpayConfig({ RAZORPAY_KEY_ID: 'invalid', RAZORPAY_KEY_SECRET: 'secret' }), /valid Razorpay key/);
  assert.throws(() => razorpayConfig({}), /RAZORPAY_KEY_ID/);
});
test('remaining amounts use exact paise and reject invalid or nonpositive values', () => {
  assert.equal(paymentAmount('₹1,500.25'), 150025);
  assert.equal(paymentAmount('1500 /-'), 150000);
  for (const input of ['', '0', '-100', 'pending', '1.234', 'Infinity', '0.99']) assert.equal(paymentAmount(input), null);
});
test('payload disables notifications, reminders, and partial payments', () => {
  const payload = linkPayload(lead, 150000, 'reference');
  assert.equal(payload.amount, 150000); assert.equal(payload.currency, 'INR');
  assert.deepEqual(payload.notify, { sms: false, email: false });
  assert.equal(payload.reminder_enable, false); assert.equal(payload.accept_partial, false);
  assert.equal(payload.customer.contact, '+919876543210');
  assert.equal(payload.notes.mode, 'test');
  const invalid = linkPayload({ ...lead, studentPhone: 'unknown', studentEmail: 'unknown' }, 150000, 'ref');
  assert.equal(invalid.customer.contact, undefined); assert.equal(invalid.customer.email, undefined);
});
test('provider responses must match reference, amount, currency and allowed HTTPS hosts', () => {
  assert.equal(validateLink(remote('ref'), 150000, 'ref').id, 'plink_example');
  for (const change of [{ reference_id: 'other' }, { amount: 100 }, { currency: 'USD' }, { short_url: 'javascript:alert(1)' }, { status: 'paid' }, { expire_by: 1 }]) assert.throws(() => validateLink({ ...remote('ref'), ...change }, 150000, 'ref'), RazorpayError);
});
test('Razorpay network/rate failures are retryable, credentials fail without exposing secrets', async () => {
  await assert.rejects(() => razorpayRequest(config, '', {}, async () => { throw new Error('secret'); }), error => error.retryable === true && !error.message.includes('secret'));
  await assert.rejects(() => razorpayRequest(config, '', {}, async () => response({}, 429)), error => error.retryable === true);
  await assert.rejects(() => razorpayRequest(config, '', {}, async () => response({}, 401)), error => error.retryable === false);
});
test('batch creates a link from server balance and saves it in the sheet without marking paid', async () => {
  const { db, state } = fixture(); let posts = 0;
  await mockedFetch(async (url, options) => {
    if (options.method === 'GET') return response({ payment_links: [] });
    posts++; const payload = JSON.parse(options.body); assert.equal(payload.amount, 150000);
    return response(remote(payload.reference_id));
  }, () => processPaymentBatch(db, config, 'job-1'));
  assert.equal(posts, 1); assert.equal(state.lead.paymentLinks, 'https://rzp.io/i/example');
  assert.equal(state.lead.paymentStatus, 'unpaid'); assert.equal(state.item.status, 'generated');
  assert.equal(state.done, true); assert.equal(state.locked, false);
});
test('paid, invalid balance, changed balance, and existing unmanaged links are skipped without Razorpay calls', async () => {
  for (const change of [{ paymentStatus: 'PAID' }, { remainingAmount: '0' }, { remainingAmount: '2000' }, { paymentLinks: 'https://example.com/keep' }]) {
    const { db, state } = fixture(change);
    await mockedFetch(() => assert.fail('Unexpected Razorpay call'), () => processPaymentBatch(db, config, 'job-1'));
    assert.equal(state.item.status, 'skipped'); assert.equal(state.writes, 0);
  }
});
test('known matching links are fetched and reused without creating another link', async () => {
  const { db, state } = fixture({ paymentLinks: 'https://rzp.io/i/example' });
  state.link = { id: 'record', amountPaise: 150000n, providerId: 'plink_example', url: state.lead.paymentLinks, reference: 'same' };
  await mockedFetch(async (url, options) => { assert.equal(options.method, 'GET'); return response(remote('same')); }, () => processPaymentBatch(db, config, 'job-1'));
  assert.equal(state.item.status, 'reused');
});
test('a timed-out creation is reconciled by its stable reference before any retry POST', async () => {
  const { db, state } = fixture(); let created; let posts = 0;
  await mockedFetch(async (url, options) => {
    if (options.method === 'GET') return response({ payment_links: [] });
    posts++; created = remote(JSON.parse(options.body).reference_id); throw new Error('response lost');
  }, () => processPaymentBatch(db, config, 'job-1'));
  assert.equal(state.item.status, 'pending');
  state.item.retryAt = null;
  await mockedFetch(async (url, options) => { assert.equal(options.method, 'GET'); return response({ payment_links: [created] }); }, () => processPaymentBatch(db, config, 'job-1'));
  assert.equal(posts, 1); assert.equal(state.item.status, 'reused'); assert.equal(state.lead.paymentLinks, created.short_url);
});
test('a changed balance during creation retains history and does not overwrite the sheet', async () => {
  const { db, state } = fixture();
  await mockedFetch(async (url, options) => {
    if (options.method === 'GET') return response({ payment_links: [] });
    state.lead.remainingAmount = '2000';
    return response(remote(JSON.parse(options.body).reference_id));
  }, () => processPaymentBatch(db, config, 'job-1'));
  assert.equal(state.item.status, 'skipped'); assert.equal(state.lead.paymentLinks, ''); assert.equal(state.link.providerId, 'plink_example');
});
test('a live job lease prevents concurrent batch processing', async () => {
  const { db, state } = fixture(); state.locked = true;
  await mockedFetch(() => assert.fail('Concurrent request reached Razorpay'), () => processPaymentBatch(db, config, 'job-1'));
  assert.equal(state.item.attempts, 0);
});

test('generation batches default to six with bounded optional concurrency', () => {
  assert.equal(paymentBatchSize('6'), 6);
  assert.equal(paymentBatchSize('12'), 12);
  assert.equal(paymentBatchSize('1'), 1);
  for (const invalid of ['0', '-1', '100', '1.5', 'abc']) assert.equal(paymentBatchSize(invalid), 6);
});
test('a brand-new link makes only one Razorpay creation request, with no redundant lookup', async () => {
  const { db, state } = fixture(); let calls = 0;
  await mockedFetch(async (url, options) => {
    calls++; assert.equal(options.method, 'POST');
    return response(remote(JSON.parse(options.body).reference_id));
  }, () => processPaymentBatch(db, config, 'job-1'));
  assert.equal(calls, 1); assert.equal(state.item.status, 'generated');
});

test('Razorpay pacing defaults to 5 requests/second and supports only 5–10', () => {
  assert.equal(paymentRequestRate('5'), 5);
  assert.equal(paymentRequestRate('10'), 10);
  for (const invalid of ['0', '4', '11', '7.5', 'abc']) assert.equal(paymentRequestRate(invalid), 5);
});
test('request gate spaces parallel starts and preserves pacing across batches', async () => {
  let clock = 0; const starts = [];
  const options = { rate: 5, canContinue: async () => true, now: () => clock, sleep: async ms => { clock += ms; } };
  const gate = createPaymentRequestGate(options);
  await Promise.all(Array.from({ length: 6 }, () => gate.run(() => { starts.push(clock); })));
  assert.deepEqual(starts, [0, 200, 400, 600, 800, 1000]);
  const next = createPaymentRequestGate({ ...options, nextAt: gate.nextAt });
  await next.run(() => starts.push(clock));
  assert.equal(starts.at(-1), 1200);
});
test('stopping a queued request prevents the provider call', async () => {
  const gate = createPaymentRequestGate({ canContinue: async () => false });
  await assert.rejects(() => gate.run(() => assert.fail('Request started after stop')), GenerationStopped);
});
test('stopping before provider creation returns the student to pending without consuming an attempt', async () => {
  const { db, state } = fixture();
  db.recoveryPaymentJob.findFirst = async () => { state.jobStatus = 'stopping'; return null; };
  await mockedFetch(() => assert.fail('Provider called after stop'), () => processPaymentBatch(db, config, 'job-1'));
  assert.equal(state.item.status, 'pending'); assert.equal(state.item.attempts, 0);
  assert.equal(state.jobStatus, 'stopped'); assert.equal(state.done, false);
});
test('already-started creation is saved before a stop completes', async () => {
  const { db, state } = fixture();
  await mockedFetch(async (url, options) => {
    state.jobStatus = 'stopping';
    return response(remote(JSON.parse(options.body).reference_id));
  }, () => processPaymentBatch(db, config, 'job-1'));
  assert.equal(state.item.status, 'generated'); assert.equal(state.lead.paymentLinks, 'https://rzp.io/i/example');
  assert.equal(state.jobStatus, 'stopped'); assert.equal(state.done, false);
});
test('stopped jobs cannot acquire a generation lease', async () => {
  const { db, state } = fixture(); state.jobStatus = 'stopped';
  await mockedFetch(() => assert.fail('Stopped job called provider'), () => processPaymentBatch(db, config, 'job-1'));
  assert.equal(state.item.attempts, 0);
});

test('first provider requests follow sheet order despite slower preparation of the top row', async () => {
  const starts = [];
  let releaseTop;
  const topReady = new Promise(resolve => { releaseTop = resolve; });
  const gate = { run: async callback => callback() };
  const work = processItemsInSheetOrder([0, 1, 2], async (item, request) => {
    if (item === 0) await topReady;
    await request(String(item));
  }, gate, async path => { starts.push(path); });
  await Promise.resolve();
  assert.deepEqual(starts, []);
  releaseTop();
  await work;
  assert.deepEqual(starts, ['0', '1', '2']);
});
test('skipping a middle row does not let lower rows bypass the top row', async () => {
  const starts = [];
  let releaseTop;
  const topReady = new Promise(resolve => { releaseTop = resolve; });
  const work = processItemsInSheetOrder([0, 1, 2], async (item, request) => {
    if (item === 1) return;
    if (item === 0) await topReady;
    await request(String(item));
  }, { run: async callback => callback() }, async path => { starts.push(path); });
  await Promise.resolve();
  assert.deepEqual(starts, []);
  releaseTop(); await work;
  assert.deepEqual(starts, ['0', '2']);
});

test('live payload explicitly enables UPI alongside other methods and has no test description', () => {
  const payload = linkPayload(lead, 150000, 'ref', 'live');
  assert.equal(payload.view_less, false);
  assert.equal(Object.hasOwn(linkPayload(lead, 150000, 'ref', 'test'), 'view_less'), false);
  assert.deepEqual(payload.options.checkout.method, { upi: true, card: true, netbanking: true, wallet: true });
  assert.equal(payload.notes.mode, 'live');
  assert.equal(payload.description, paymentLinkDescription(lead, 150000));
  assert.equal(payload.upi_link, undefined); // Standard link keeps other payment methods.
  assert.deepEqual(payload.notify, { sms: false, email: false });
  assert.equal(linkPayload(lead, 150000, 'ref', 'test').options, undefined);
});
test('switching to live supersedes only a tracked test link for the same balance', async () => {
  const { db, state } = fixture({ paymentLinks: 'https://rzp.io/i/test-link' });
  state.testHistory = { amountPaise: 150000n };
  const live = { key: 'rzp_live_example', secret: 'secret', mode: 'live' };
  const update = db.recoveryPaymentJob.updateMany;
  db.recoveryPaymentJob.updateMany = args => update({ ...args, where: { ...args.where, ...(args.where.accountKey ? { accountKey: config.key } : {}) } });
  await mockedFetch(async (url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.options.checkout.method.upi, true);
    assert.equal(payload.notes.mode, 'live');
    return response(remote(payload.reference_id));
  }, () => processPaymentBatch(db, live, 'job-1'));
  assert.equal(state.item.status, 'generated');
  assert.equal(state.lead.paymentLinks, 'https://rzp.io/i/example');
});

test('payment description preserves every approved word while substituting fee and payable amount', () => {
  const description = paymentLinkDescription({ amountMentioned: '₹4,500/-' }, 300000);
  assert.equal(description, `Complete Your Registration

TOTAL COST OF THE PROGRAM IS 4500 AND YOU ARE PAYING RS 3000 AS Remaining REGISTRATION

Note- The Transaction should be done only with the official Link Which Shows Persevex any transactions to another the company will not be Responsible for your Money

Contact Us:
support@persevex.com
+918660128339

Terms & Conditions:
You agree to share information entered on this page with PERSEVEX (owner of this page) and Razorpay, adhering to applicable laws.`);
  assert.ok(description.length <= 2048);
  assert.ok(paymentLinkDescription({ amountMentioned: '3500.50' }, 10025).includes('3500.50 AND YOU ARE PAYING RS 100.25'));
  assert.throws(() => paymentLinkDescription({ amountMentioned: '' }, 300000), /Program fee/);
});
