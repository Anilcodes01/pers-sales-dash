// Server-only integration: imported by API handlers and the standalone worker.
export function razorpayConfig(env = process.env) {
  const key = env.RAZORPAY_KEY_ID?.trim();
  const secret = env.RAZORPAY_KEY_SECRET?.trim();
  if (!key || !secret) throw new Error('Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.');
  if (!/^rzp_(?:test|live)_[A-Za-z0-9]+$/.test(key)) throw new Error('Use a valid Razorpay key ID starting with rzp_test_ or rzp_live_.');
  return { key, secret, mode: key.startsWith('rzp_live_') ? 'live' : 'test' };
}
export function paymentAmount(value) {
  const cleaned = value.trim().replace(/^(?:₹|rs\.?|inr)\s*/i, '').replace(/\s*\/-$/, '').replace(/,/g, '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount >= 100 && amount <= 100_000_000_000 ? amount : null;
}
export function paymentLinkDescription(lead, amount) {
  const fee = paymentAmount(lead.amountMentioned || '');
  if (fee === null) throw new RazorpayError('Program fee is missing or invalid. Correct Amount Mentioned before generating a link.');
  const rupees = paise => Number.isInteger(paise / 100) ? String(paise / 100) : (paise / 100).toFixed(2);
  return `Complete Your Registration

TOTAL COST OF THE PROGRAM IS ${rupees(fee)} AND YOU ARE PAYING RS ${rupees(amount)} AS Remaining REGISTRATION

Note- The Transaction should be done only with the official Link Which Shows Persevex any transactions to another the company will not be Responsible for your Money

Contact Us:
support@persevex.com
+918660128339

Terms & Conditions:
You agree to share information entered on this page with PERSEVEX (owner of this page) and Razorpay, adhering to applicable laws.`;
}
export function linkPayload(lead, amount, reference, mode = 'test') {
  const customer = {};
  if (lead.studentName.trim()) customer.name = lead.studentName.trim().slice(0, 100);
  const email = lead.studentEmail.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) customer.email = email;
  const digits = lead.studentPhone.replace(/\D/g, '');
  if (/^\d{10}$/.test(digits)) customer.contact = `+91${digits}`;
  else if (/^91\d{10}$/.test(digits)) customer.contact = `+${digits}`;
  return { amount, currency: 'INR', accept_partial: false, reference_id: reference,
    ...(mode === 'live' ? { view_less: false } : {}),
    description: paymentLinkDescription(lead, amount), customer,
    ...(mode === 'live' ? { options: { checkout: { method: { upi: true, card: true, netbanking: true, wallet: true } } } } : {}),
    notify: { sms: false, email: false }, reminder_enable: false,
    notes: { recovery_lead_id: lead.id, mode } };
}
export class RazorpayError extends Error {
  constructor(message, retryable = false) { super(message); this.retryable = retryable; }
}
export async function razorpayRequest(config, path, body, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(`https://api.razorpay.com/v1/payment_links${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Basic ${Buffer.from(`${config.key}:${config.secret}`).toString('base64')}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(8000), cache: 'no-store',
    });
  } catch { throw new RazorpayError('Razorpay timed out. The next attempt will check for an existing link first.', true); }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new RazorpayError('Razorpay rejected the API credentials. Check the matching key ID and secret on the server.');
    if (response.status === 429) throw new RazorpayError('Razorpay rate limit reached. Retrying shortly.', true);
    if (response.status >= 500) throw new RazorpayError('Razorpay is temporarily unavailable. Retrying shortly.', true);
    const failure = await response.json().catch(() => ({}));
    if (/reference.*(?:already|attempted|exist)/i.test(failure.error?.description || '')) throw new RazorpayError('Reference already exists. Retrying its lookup before creating anything.', true);
    throw new RazorpayError(config.mode === 'live'
      ? 'Razorpay rejected the live link. Check the amount, customer details, live account activation, and enabled payment methods.'
      : 'Razorpay rejected the link. Check the amount, customer details, and test-account link limit.');
  }
  try { return await response.json(); }
  catch { throw new RazorpayError('Razorpay returned an unreadable response. Retrying safely.', true); }
}
export function validateLink(link, amount, reference) {
  let url;
  try { url = new URL(link.short_url); } catch { throw new RazorpayError('Razorpay returned an invalid payment URL.'); }
  if (link.reference_id !== reference || link.amount !== amount || link.currency !== 'INR' || !/^plink_/.test(link.id) || url.protocol !== 'https:' || !(url.hostname === 'rzp.io' || url.hostname.endsWith('.rzp.io') || url.hostname === 'razorpay.com' || url.hostname.endsWith('.razorpay.com'))) throw new RazorpayError('Razorpay link did not match this student and amount.');
  if (link.status !== 'created' || (link.expire_by && link.expire_by * 1000 <= Date.now())) throw new RazorpayError('Existing link is paid, expired, or cancelled. Replacement will require the future replacement flow.');
  return link;
}
