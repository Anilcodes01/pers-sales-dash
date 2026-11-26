# AWS Amplify deployment

`amplify.yml` installs Node.js 22, performs a lockfile-based npm install (including Prisma client generation), writes the allowlisted SSR environment, builds Next.js using webpack, and publishes `.next`. It does not run a server or apply database migrations.

## Amplify console configuration

Add these environment variables for the deployment branch:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `DATABASE_URL` — Supabase pooled runtime connection, including `pgbouncer=true` for transaction mode.

`DIRECT_URL` is only needed in your separate migration workflow; it is intentionally not included in the runtime environment file. Apply reviewed migrations separately before deploying features that require them. The repository currently has no baseline migration history in the runtime database, so do not blindly run all migrations against its existing tables.

Use Amplify Hosting's SSR/compute deployment, not a static export. Connect the repository root and let Amplify use the checked-in buildspec. Keep the runtime secrets server-only; do not add `NEXT_PUBLIC_` prefixes. The build script writes `.env.production` without logging values. Restrict access to build/deployment artifacts because they can contain runtime credentials. For stricter secret management, use AWS Secrets Manager with an SSR compute IAM role and adapt runtime configuration accordingly.

## Compatibility requirement

This project currently uses Next.js 16.4.6, `proxy.ts`, Cache Components, and partial prefetching. AWS's published Amplify SSR documentation currently lists support through Next.js 15 and lists Next.js streaming as unsupported. The build configuration does not resolve that platform mismatch. Confirm supported Next.js 16 hosting capabilities with AWS, adapt the app to an explicitly supported version, or use a hosting target supporting this version before treating deployment as production-ready. No dependency downgrade is performed by this change.

References: [AWS Next.js support](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html), [SSR environment variables](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-environment-variables.html).
