This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


### Recovery payment links (test and live mode)

Add these server-only credentials to `.env` (and Amplify environment variables):

```dotenv
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_test_key_secret
```

Both test (`rzp_test_...`) and live (`rzp_live_...`) credentials are supported. Mode is derived from the server key ID. Live link creation explicitly enables UPI alongside card, netbanking, and wallet methods; UPI must also be enabled on the live merchant account. The Amplify environment preparation script includes these optional credentials in the SSR runtime environment. Restart an already-running development server yourself after adding credentials.

Apply `prisma/migrations/202611270003_recovery_payment_links/migration.sql` to an existing database whose earlier schemas were applied manually. On a database managed with Prisma migrations, use `npm run db:migrate`. Generate the local client with `npm run db:generate`.

Recovery admins can use **Generate payment links** beside the month filter on Recovery Overview. The server snapshots all rows for that selection, validates each current remaining balance, generates standard INR links with partial payments and SMS/email/reminders disabled, and saves successful URLs to `payment_links`. Paid students, invalid/zero balances, unmanaged existing links, and changed amounts are skipped. Matching tracked links are verified and reused. No payment statuses or recovery statistics are updated.

Jobs and per-student outcomes are persistent. The page processes bounded batches while open and resumes the active job when reopened. For processing that continues when all browser pages are closed, run the included worker as a separate long-running process on your worker host:

```sh
npm run worker:payment-links
```

Next.js/Amplify SSR alone does not host that long-running worker. It must be deployed separately (for example as a supervised container/service). The worker and the page share database leases, so running both does not duplicate generation. The worker needs the same database URL and matching Razorpay credentials; there is no public unauthenticated processing endpoint.

Transient provider errors retry with backoff up to three attempts; use **Retry failed** after completion for further attempts. Stable references are reconciled with Razorpay before creation, including after timeouts or an interrupted database write. Existing links are not cancelled/replaced when amounts change; that business flow is intentionally deferred. Existing registration/payment values and manually entered links are preserved.

Razorpay currently documents a 30 Payment Link limit per business in test mode. Contact Razorpay Support if a larger test batch is required: https://razorpay.com/docs/api/payments/payment-links/create-standard/

Tests: `node --test tests/auth.test.mjs tests/payment-links.test.mjs`. These use mocked provider responses and create no real payment links.

Generation processes six students concurrently by default. Set `RECOVERY_PAYMENT_CONCURRENCY` to an integer from 1–12 to tune this for your database pool and Razorpay rate limits. New links use a single provider creation request; existing/uncertain attempts still reconcile before any creation. Both the page and standalone worker continue immediately after productive batches and back off when idle.

Use **Stop generation** to stop a running job. Requests already sent to Razorpay finish and their links are saved; queued requests check the shared stop state before calling Razorpay. **Resume generation** continues pending students without replacing completed links. The job stays active while stopping so another admin cannot overlap a new generation job.

Apply `prisma/migrations/202611270004_payment_generation_stop_rate/migration.sql` for stop state coordination and cross-batch pacing. Provider requests (including reconciliation lookups) are paced at up to **5 starts per second** by default. `RECOVERY_PAYMENT_REQUESTS_PER_SECOND=10` increases this ceiling to 10; allowed values are integers 5–10. Concurrency and network/database latency may keep actual throughput below the ceiling. Razorpay rate-limit responses still trigger retry backoff.

Payment-link jobs snapshot the Recovery Overview row order (`createdAt DESC, id ASC`) into an indexed item position. Apply `202611270005_payment_sheet_order/migration.sql` to backfill existing jobs. Batches and first provider requests follow this order, while parallel responses can complete in a different order. Retryable rows in backoff do not block later eligible students.

To switch to live payments, use `RAZORPAY_KEY_ID=rzp_live_...` and its matching `RAZORPAY_KEY_SECRET`, then restart the server and any standalone worker yourself. Test and live jobs/links are isolated by account key. A tracked test link may be superseded in the sheet by a new live link only for the same remaining amount; the original test record remains stored. Unmanaged links and existing live links are preserved, and balance-change cancellation/replacement remains deferred. Payment confirmation/webhooks remain outside this generation-only feature.

### Razorpay payment webhook

Set a separate server-side signing secret in `.env` and in Amplify:

```dotenv
RAZORPAY_WEBHOOK_SECRET=choose_a_long_random_webhook_secret
```

In the **Live** Razorpay Dashboard, add a webhook with:

- URL: `https://YOUR_DEPLOYED_APP_DOMAIN/api/webhooks/razorpay`
- Secret: the exact value of `RAZORPAY_WEBHOOK_SECRET` (not the API key secret)
- Event: `payment_link.paid`

Deploy/restart the app after adding the environment variable. Localhost cannot receive Razorpay deliveries directly; local testing needs a public HTTPS tunnel configured separately. No tunnel or development server is started by this implementation.

Apply `prisma/migrations/202611270006_recovery_webhooks/migration.sql` for the webhook receipt table. Requests are authenticated using constant-time HMAC-SHA256 verification of the untouched raw request body. Fully captured INR payments are matched to the stored link reference, provider ID, currency, and original link amount. Only tracked live links mark a lead Paid. Test payments are acknowledged without changing real recovery status. Duplicate deliveries are deduplicated by Razorpay event ID and body hash in the same transaction as the status update. Unknown/not-yet-saved links return a retryable response.

A confirmed payment updates `paymentStatus` to `paid` and records `paidAt`, preserving an existing paid timestamp. It also records the provider link's paid state. It **never changes `amountPaid` or `remainingAmount`**. Admin/executive sheets and Recovered Leads quietly refresh every 10 seconds while visible, and refresh when the tab regains focus. Existing active text editors are not interrupted. An open statistics panel refreshes every 15 seconds.

Verification: `node --test tests/auth.test.mjs tests/payment-links.test.mjs tests/payment-webhook.test.mjs`. Tests use signed mock webhook bodies, not real customer payments.
