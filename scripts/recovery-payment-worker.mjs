// Durable worker: run separately from Next.js, locally or on a worker host.
import { existsSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { razorpayConfig } from '../lib/recovery/razorpay.mjs';
import { processPaymentBatch } from '../lib/recovery/payment-link-worker.mjs';
if (existsSync('.env')) process.loadEnvFile('.env');
const config = razorpayConfig();
let url;
try {
  url = new URL(process.env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
} catch {
  console.error('Set a valid DATABASE_URL before starting the payment-link worker.');
  process.exit(1);
}
if (url.hostname.endsWith('.pooler.supabase.com') && url.port === '6543') url.searchParams.set('pgbouncer', 'true');
const client = new PrismaClient({ datasources: { db: { url: url.toString() } } });
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
console.log(`Recovery payment-link worker ready (${config.mode} mode).`);
try {
  while (!stopping) {
    let worked = false;
    try {
      const job = await client.recoveryPaymentJob.findFirst({ where: { accountKey: config.key, status: { in: ['running', 'stopping'] } }, orderBy: { createdAt: 'asc' } });
      if (job) worked = (await processPaymentBatch(client, config, job.id)).processed > 0;
    } catch { console.error('Payment-link batch unavailable; retrying. Check database connectivity and migration status.'); }
    if (!stopping && !worked) await new Promise(resolve => setTimeout(resolve, 3000));
  }
} finally { await client.$disconnect(); }
