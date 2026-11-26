// Amplify build variables are not automatically available to Next.js SSR.
// Write only the runtime allowlist. Never print credentials into build logs.
import { writeFileSync } from 'node:fs';
const keys = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'DATABASE_URL'];
const missing = keys.filter(key => !process.env[key]);
if (missing.length) {
  console.error(`Set these Amplify environment variables before building: ${missing.join(', ')}`);
  process.exit(1);
}
// Escape dollars for Next.js dotenv expansion as well as quotes/newlines.
const content = keys.map(key => `${key}=${JSON.stringify(process.env[key]).replace(/\$/g, '\\$')}`).join('\n');
writeFileSync('.env.production', `${content}\n`, { mode: 0o600 });
console.log('Prepared the allowlisted SSR environment variables.');
