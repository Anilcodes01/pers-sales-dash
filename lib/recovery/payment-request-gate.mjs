export class GenerationStopped extends Error {}
export function paymentRequestRate(value = process.env.RECOVERY_PAYMENT_REQUESTS_PER_SECOND) {
  const rate = Number(value ?? 5);
  return Number.isInteger(rate) && rate >= 5 && rate <= 10 ? rate : 5;
}
// One account/job lease owns this gate. Persist nextAt between batches so a new
// browser request or worker process cannot reset the pacing at batch boundaries.
export function createPaymentRequestGate({ rate = 5, nextAt = 0, canContinue, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  let tail = Promise.resolve();
  let next = nextAt;
  return {
    get nextAt() { return next; },
    async run(request) {
      const turn = tail.catch(() => {}).then(async () => {
        const delay = next - now();
        if (delay > 0) await sleep(delay);
        if (!await canContinue()) throw new GenerationStopped('Generation stopped.');
        next = now() + 1000 / rate;
      });
      tail = turn;
      await turn;
      return request();
    },
  };
}
