// Run manually: node --env-file=.env scripts/bootstrap-main-admin.mjs
// This is a local setup tool, never an HTTP endpoint.
import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY before bootstrapping.');
  process.exit(1);
}
if (!process.stdin.isTTY) {
  console.error('Run in an interactive terminal so the password can be entered privately.');
  process.exit(1);
}
let muted = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk, encoding); callback(); } });
const prompt = createInterface({ input: process.stdin, output, terminal: true });
try {
  const email = (await prompt.question('New main admin email: ')).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid email address.');
  process.stdout.write('Password (6–128 characters, hidden): '); muted = true;
  const password = await prompt.question('');
  process.stdout.write('\nConfirm password (hidden): ');
  const confirmation = await prompt.question(''); muted = false; process.stdout.write('\n');
  if (password.length < 6 || password.length > 128 || password !== confirmation) throw new Error('Passwords must match and contain 6–128 characters.');
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'main_admin', credentials_version: randomUUID() } });
  if (error) throw new Error('Could not create the main admin. Check for an existing email and your Supabase password policy.');
  console.log('Main admin created. Sign in with those credentials, then open /users.');
} catch (error) {
  muted = false;
  console.error(error instanceof Error ? error.message : 'Bootstrap failed.');
  process.exitCode = 1;
} finally { prompt.close(); }
