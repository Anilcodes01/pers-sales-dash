import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';

const member = { id: '11111111-1111-4111-8111-111111111111', email: 'member@example.com', app_metadata: { role: 'sales_executive' }, created_at: '2026-11-25' };
const mainAdmin = { ...member, id: '22222222-2222-4222-8222-222222222222', app_metadata: { role: 'main_admin' } };
function load(file, options = {}) {
  const cache = new Map();
  function module(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const exports = {}; cache.set(filename, exports);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, URL, Buffer, Response, File, TextDecoder, process: { env: {} }, require(name) {
      if (name === 'server-only') return {};
      if (name === '@/lib/db') return { db: () => { options.onDb?.(); return options.db; } };
      if (name === 'next/navigation') return { redirect: (destination) => { throw new Error(`REDIRECT:${destination}`); } };
      if (name === 'csv-parse/sync') return { parse };
      if (name === 'node:crypto') return { createHash, randomUUID: () => 'new-version' };
      if (name === 'next/server') return { connection: async () => { options.onConnection?.(); }, NextResponse: { json: (body, extra) => ({ body, ...extra }) } };
      if (name === '@/lib/supabase/server') return { createAuthClient: async () => options.client };
      if (name === '@/lib/supabase/config') return { authConfigured: () => options.configured !== false };
      if (name === '@/lib/supabase/admin') return { adminConfigured: () => options.adminConfigured !== false, createAdminClient: () => {
        options.onAdminClient?.(); return { auth: { admin: options.admin } };
      } };
      if ((name === './session' || name === '@/lib/auth/session') && !options.realSession) return { currentUser: async () => options.user || null };
      const resolved = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(filename), name);
      return module(`${resolved}.ts`);
    } });
    return exports;
  }
  return module(file);
}
function request(body = {}, origin = 'http://localhost:3000', url = 'http://localhost:3000/api/auth/login') {
  const req = new Request(url, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  req.nextUrl = new URL(req.url); return req;
}
const context = (action) => ({ params: Promise.resolve({ action }) });
const authFile = 'app/api/auth/[action]/route.ts';
const usersFile = 'app/api/main-admin/users/route.ts';
const updateFile = 'app/api/main-admin/users/[id]/route.ts';

test('rejects cross-origin auth writes', async () => {
  assert.equal((await load(authFile).POST(request({}, 'https://other.example'), context('login'))).status, 403);
});
test('missing configuration returns safe 503', async () => {
  assert.equal((await load(authFile, { configured: false }).POST(request(), context('login'))).status, 503);
});
test('member recovery and password mutation endpoints no longer exist', async () => {
  for (const action of ['forgot-password', 'reset-password', 'signup', 'change-password']) assert.equal((await load(authFile).POST(request(), context(action))).status, 404);
});
test('invalid credentials do not receive a redirect', async () => {
  const result = await load(authFile, { client: { auth: { signInWithPassword: async () => ({ error: { status: 400 } }) } } }).POST(request({ email: member.email, password: 'incorrect' }), context('login'));
  assert.equal(result.status, 401); assert.equal(result.body.redirect, undefined);
});
test('valid login returns account destination without tokens or passwords', async () => {
  const result = await load(authFile, { client: { auth: { signInWithPassword: async () => ({ data: { user: member }, error: null }) } } }).POST(request({ email: member.email, password: 'password' }), context('login'));
  assert.equal(result.body.redirect, '/sales-dashboard'); assert.equal(result.headers['Cache-Control'], 'private, no-store'); assert.equal(Object.keys(result.body).length, 1);
});
test('unauthenticated and non-admin requests never construct privileged client', async () => {
  for (const user of [null, member, { ...member, user_metadata: { role: 'main_admin' } }]) {
    let touched = false;
    const options = { user, onAdminClient: () => { touched = true; } };
    const result = await load(usersFile, options).POST(request({ email: 'new@example.com', password: 'long-password-123', role: 'main_admin' }));
    assert.equal(result.status, user ? 403 : 401); assert.equal(touched, false);
    const req = { nextUrl: new URL('http://localhost:3000/api/main-admin/users') };
    assert.equal((await load(usersFile, options).GET(req)).status, user ? 403 : 401);
    assert.equal(touched, false);
  }
});
test('account creation confirms email and stores only trusted role metadata', async () => {
  let sent;
  const result = await load(usersFile, { user: mainAdmin, admin: { createUser: async (input) => { sent = input; return { data: { user: { ...member, app_metadata: input.app_metadata } }, error: null }; } } }).POST(request({ name: '  Ankit   Sharma  ', email: member.email, password: 'Abc123', role: 'recovery_executive' }));
  assert.equal(result.status, 201); assert.equal(sent.password, 'Abc123'); assert.equal(sent.email_confirm, true); assert.equal(sent.user_metadata.full_name, 'Ankit Sharma'); assert.equal(sent.app_metadata.role, 'recovery_executive'); assert.equal(sent.app_metadata.created_by, mainAdmin.id);
  assert.equal(JSON.stringify(result.body).includes('Abc123'), false); assert.equal(JSON.stringify(sent.app_metadata).includes('password'), false);
});
test('invalid roles and short passwords never reach createUser', async () => {
  let touched = false;
  const api = load(usersFile, { user: mainAdmin, admin: { createUser: async () => { touched = true; } } });
  for (const body of [{ email: member.email, password: 'long-password-123', role: 'owner' }, { email: member.email, password: 'short', role: 'sales_executive' }]) assert.equal((await api.POST(request(body))).status, 400);
  assert.equal(touched, false);
});
test('admin password reset changes credential version without returning the password', async () => {
  let sent;
  const result = await load(updateFile, { user: mainAdmin, admin: { getUserById: async () => ({ data: { user: member } }), updateUserById: async (_id, input) => { sent = input; return { data: { user: { ...member, app_metadata: input.app_metadata } } }; } } }).PATCH(request({ password: 'a-new-password-123' }), { params: Promise.resolve({ id: member.id }) });
  assert.equal(result.status, 200); assert.equal(sent.password, 'a-new-password-123'); assert.equal(sent.app_metadata.credentials_version, 'new-version'); assert.equal(sent.app_metadata.role, 'sales_executive'); assert.equal(JSON.stringify(result.body).includes('a-new-password-123'), false);
});
test('existing main admin cannot be demoted', async () => {
  const result = await load(updateFile, { user: mainAdmin, admin: { getUserById: async () => ({ data: { user: mainAdmin } }) } }).PATCH(request({ role: 'sales_executive' }), { params: Promise.resolve({ id: mainAdmin.id }) });
  assert.equal(result.status, 400);
});
test('fresh user role overrides an old session role; old credentials are rejected', async () => {
  const client = { auth: { getUser: async () => ({ data: { user: { ...member, app_metadata: { role: 'sales_executive', credentials_version: 'new' } } } }), getClaims: async () => ({ data: { claims: { app_metadata: { role: 'main_admin', credentials_version: 'old' } } } }) } };
  assert.equal(await load('lib/auth/session.ts', { client, realSession: true }).currentUser(), null);
});
test('large and invalid JSON account bodies are rejected before privileged access', async () => {
  const api = load(usersFile);
  assert.equal((await api.POST(request({ email: 'a'.repeat(9000) }))).status, 413);
  assert.equal((await api.POST(request(null))).status, 400);
});
test('every non-main-admin role is denied password resets', async () => {
  for (const role of ['recovery_admin', 'recovery_executive', 'team_leader', 'sales_executive']) {
    let touched = false;
    const result = await load(updateFile, { user: { ...member, app_metadata: { role } }, onAdminClient: () => { touched = true; } }).PATCH(request({ password: 'a-new-password-123' }), { params: Promise.resolve({ id: member.id }) });
    assert.equal(result.status, 403); assert.equal(touched, false);
  }
});
test('admin writes reject another origin even for an authorized actor', async () => {
  let touched = false;
  const result = await load(usersFile, { user: mainAdmin, onAdminClient: () => { touched = true; } }).POST(request({}, 'https://other.example'));
  assert.equal(result.status, 403); assert.equal(touched, false);
});
test('user listing returns only safe summaries with pagination', async () => {
  const result = await load(usersFile, { user: mainAdmin, admin: { listUsers: async (options) => {
    assert.equal(options.perPage, 20); assert.equal(options.page, 2);
    return { data: { users: [{ ...member, app_metadata: { ...member.app_metadata, internal_secret: 'do-not-return' } }], nextPage: 3 }, error: null };
  } } }).GET({ nextUrl: new URL('http://localhost:3000/api/main-admin/users?page=2') });
  assert.equal(result.body.hasMore, true); assert.equal(result.body.page, 2); assert.equal(JSON.stringify(result.body).includes('do-not-return'), false);
});

test('every role receives its own dashboard after sign-in', async () => {
  const destinations = { main_admin: '/admin-dashboard', recovery_admin: '/recovery-dashboard', recovery_executive: '/recovery-executive-dashboard', team_leader: '/team-dashboard', sales_executive: '/sales-dashboard' };
  for (const [role, destination] of Object.entries(destinations)) {
    const client = { auth: { signInWithPassword: async () => ({ data: { user: { ...member, app_metadata: { role } } }, error: null }) } };
    const result = await load(authFile, { client }).POST(request({ email: member.email, password: 'Abc123' }), context('login'));
    assert.equal(result.body.redirect, destination);
  }
});
test('auth work waits for the request boundary before invoking Supabase', async () => {
  let connected = false;
  const client = { auth: { getUser: async () => {
    assert.equal(connected, true); return { data: { user: member } };
  }, getClaims: async () => ({ data: { claims: { app_metadata: member.app_metadata } } }) } };
  const result = await load('lib/auth/session.ts', { client, realSession: true, onConnection: () => { connected = true; } }).currentUser();
  assert.equal(result.id, member.id);
});

test('signed-in users cannot access guest pages for any role', async () => {
  const destinations = { main_admin: '/admin-dashboard', recovery_admin: '/recovery-dashboard', recovery_executive: '/recovery-executive-dashboard', team_leader: '/team-dashboard', sales_executive: '/sales-dashboard', unassigned: '/dashboard' };
  for (const [role, destination] of Object.entries(destinations)) {
    const guard = load('lib/auth/guest-access.ts', { user: { ...member, app_metadata: { role } } });
    await assert.rejects(guard.redirectSignedInUser(), (error) => error.message === `REDIRECT:${destination}`);
  }
});
test('signed-out users can access guest pages', async () => {
  await load('lib/auth/guest-access.ts', { user: null }).redirectSignedInUser();
});

test('team APIs reject every non-main-admin role before querying the database', async () => {
  for (const role of [null, 'sales_executive', 'team_leader', 'recovery_admin', 'recovery_executive']) {
    let touched = false;
    const options = { user: role ? { ...member, app_metadata: { role } } : null, onDb: () => { touched = true; } };
    const api = load('app/api/main-admin/teams/route.ts', options);
    assert.equal((await api.GET()).status, role ? 403 : 401);
    assert.equal((await api.POST(request({ name: 'Sales North' }))).status, role ? 403 : 401);
    assert.equal(touched, false);
  }
});
test('team names are normalized and empty names rejected', async () => {
  let saved;
  const api = load('app/api/main-admin/teams/route.ts', { user: mainAdmin, db: { team: { create: async ({ data }) => { saved = data; return { id: member.id, name: data.name }; } } } });
  assert.equal((await api.POST(request({ name: '  Sales   North  ' }))).status, 201);
  assert.equal(saved.name, 'Sales North'); assert.equal(saved.nameKey, 'sales north'); assert.equal(saved.createdBy, mainAdmin.id);
  assert.equal((await api.POST(request({ name: '   ' }))).status, 400);
});
test('duplicate team names return a conflict', async () => {
  const api = load('app/api/main-admin/teams/route.ts', { user: mainAdmin, db: { team: { create: async () => { throw { code: 'P2002' }; } } } });
  assert.equal((await api.POST(request({ name: 'Sales North' }))).status, 409);
});
test('assignment validates provider user and upserts a single current team', async () => {
  let write;
  const teamId = '33333333-3333-4333-8333-333333333333';
  const api = load('app/api/main-admin/users/[id]/team/route.ts', { user: mainAdmin, admin: { getUserById: async () => ({ data: { user: member } }) }, db: { team: { findUnique: async () => ({ id: teamId }) }, teamMembership: { upsert: async input => { write = input; return { userId: member.id, teamId }; } } } });
  const result = await api.PATCH(request({ teamId }), { params: Promise.resolve({ id: member.id }) });
  assert.equal(result.status, 200); assert.equal(write.where.userId, member.id); assert.equal(write.update.teamId, teamId); assert.equal(write.create.assignedBy, mainAdmin.id);
});
test('assignment rejects nonexistent users and teams without writing', async () => {
  const teamId = '33333333-3333-4333-8333-333333333333';
  const context = { params: Promise.resolve({ id: member.id }) };
  const noUser = load('app/api/main-admin/users/[id]/team/route.ts', { user: mainAdmin, admin: { getUserById: async () => ({ data: { user: null } }) } });
  assert.equal((await noUser.PATCH(request({ teamId }), context)).status, 404);
  const noTeam = load('app/api/main-admin/users/[id]/team/route.ts', { user: mainAdmin, admin: { getUserById: async () => ({ data: { user: member } }) }, db: { team: { findUnique: async () => null } } });
  assert.equal((await noTeam.PATCH(request({ teamId }), context)).status, 404);
});
test('removing a team assignment is idempotent', async () => {
  let removed;
  const api = load('app/api/main-admin/users/[id]/team/route.ts', { user: mainAdmin, admin: { getUserById: async () => ({ data: { user: member } }) }, db: { teamMembership: { deleteMany: async input => { removed = input; return { count: 0 }; } } } });
  const result = await api.PATCH(request({ teamId: null }), { params: Promise.resolve({ id: member.id }) });
  assert.equal(result.status, 200); assert.equal(result.body.membership.teamId, null); assert.equal(removed.where.userId, member.id);
});
test('team writes reject cross-origin requests before privileged access', async () => {
  let touched = false;
  const api = load('app/api/main-admin/teams/route.ts', { user: mainAdmin, onDb: () => { touched = true; } });
  assert.equal((await api.POST(request({ name: 'Sales' }, 'https://other.example'))).status, 403); assert.equal(touched, false);
});

test('admin can update a name without changing role or password', async () => {
  let sent;
  const api = load(updateFile, { user: mainAdmin, admin: { getUserById: async () => ({ data: { user: { ...member, user_metadata: { avatar_url: 'https://example.com/avatar.png' } } } }), updateUserById: async (_id, input) => { sent = input; return { data: { user: { ...member, user_metadata: input.user_metadata } } }; } } });
  const result = await api.PATCH(request({ name: '  Ankit   Sharma ' }), { params: Promise.resolve({ id: member.id }) });
  assert.equal(result.status, 200); assert.equal(result.body.user.name, 'Ankit Sharma'); assert.equal(sent.user_metadata.avatar_url, 'https://example.com/avatar.png'); assert.equal(sent.password, undefined); assert.equal(sent.app_metadata.role, 'sales_executive');
});
test('invalid user names are rejected before account creation', async () => {
  let called = false;
  const api = load(usersFile, { user: mainAdmin, admin: { createUser: async () => { called = true; } } });
  for (const name of ['', '   ', 'x'.repeat(101), 123]) assert.equal((await api.POST(request({ name, email: member.email, role: 'sales_executive', password: 'Abc123' }))).status, 400);
  assert.equal(called, false);
});

test('Supabase transaction pooler uses Prisma PgBouncer compatibility', () => {
  const { runtimeDatabaseUrl } = load('lib/database-url.ts');
  const pooled = new URL(runtimeDatabaseUrl('postgresql://test:secret@aws-0-example.pooler.supabase.com:6543/postgres?sslmode=require'));
  assert.equal(pooled.searchParams.get('pgbouncer'), 'true');
  assert.equal(pooled.searchParams.get('sslmode'), 'require');
  assert.equal(pooled.password, 'secret');
  const direct = new URL(runtimeDatabaseUrl('postgresql://test:secret@db.example.supabase.co:5432/postgres'));
  assert.equal(direct.searchParams.has('pgbouncer'), false);
  const session = new URL(runtimeDatabaseUrl('postgresql://test:secret@aws-0-example.pooler.supabase.com:5432/postgres'));
  assert.equal(session.searchParams.has('pgbouncer'), false);
});

const salesHeader = 'DATE,NAME,COLLEGE,EMAIL ID,PHONE NO.,WHATSAPP NO.,PROGRAM PLAN,AMOUNT,PRE REG,COMMENTS';
const salesLine = '17-05-2026,Example Student,"Example College, Delhi",student@example.com,+91 99588 58696,,Self Paced,4500,1500,"Called, interested"';
test('CSV parser accepts screenshot headers, BOM, blank rows, quoted fields, and optional contacts', () => {
  const { parseSalesCsv } = load('lib/sales/csv.ts');
  const result = parseSalesCsv('\uFEFF' + salesHeader + '\r\n,,,,,,,,,\r\n' + salesLine + '\r\n');
  assert.ok(result.rows.length > 0); assert.equal(result.rows.length, 1);
  const row = result.rows[0]; assert.equal(row.dateFromCsv, '2026-05-17'); assert.equal(row.college, 'Example College, Delhi'); assert.equal(row.totalAmountPaise, 450000); assert.equal(row.registrationAmountPaise, 150000); assert.equal(row.phone, '+91 99588 58696'); assert.equal(row.whatsapp, null); assert.equal(row.comments, 'Called, interested');
});
test('CSV parser preserves quoted multiline comments and money precision', () => {
  const { parseSalesCsv } = load('lib/sales/csv.ts');
  const input = salesHeader + '\n17-05-2026,Example,College,,,,Self Paced,"4,500.25",1500.50,"First line\nSecond line"';
  const result = parseSalesCsv(input); assert.ok(result.rows.length > 0); assert.equal(result.rows[0].totalAmountPaise, 450025); assert.equal(result.rows[0].registrationAmountPaise, 150050); assert.equal(result.rows[0].comments, 'First line\nSecond line');
});
test('CSV rows are retained without name, date, or financial correction requirements', () => {
  const { parseSalesCsv } = load('lib/sales/csv.ts');
  const result = parseSalesCsv(salesHeader + '\n31-02-2026,,College,,,,Self Paced,-4500,1500,');
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].name, ''); assert.equal(result.rows[0].dateFromCsv, null); assert.equal(result.rows[0].rawValues.dateFromCsv, '31-02-2026'); assert.equal(result.rows[0].rawValues.totalAmountPaise, '-4500');
  const tooMuch = parseSalesCsv(salesHeader + '\n17-05-2026,Example,College,,,,Self Paced,1000,1500,'); assert.equal(tooMuch.rows[0].registrationAmountPaise, 150000);
});
test('CSV parser rejects missing/duplicate columns, malformed CSV and too many rows', () => {
  const { parseSalesCsv } = load('lib/sales/csv.ts');
  assert.throws(() => parseSalesCsv('DATE,NAME\n17-05-2026,Example'), /column/);
  assert.throws(() => parseSalesCsv(salesHeader + ',DATE\n' + salesLine + ',17-05-2026'), /exactly one/);
  assert.throws(() => parseSalesCsv(salesHeader + '\n"unterminated'), /could not be read/);
  assert.throws(() => parseSalesCsv(salesHeader + '\n' + Array(5001).fill(salesLine).join('\n')), /5000/);
});
test('repeated CSV rows are retained with stable occurrence identities', () => {
  const { parseSalesCsv } = load('lib/sales/csv.ts');
  const rows = parseSalesCsv(salesHeader + '\n' + salesLine + '\n' + salesLine).rows;
  assert.notEqual(rows[0].rowHash, rows[1].rowHash); assert.notEqual(rows[0].sourceRow, rows[1].sourceRow); const again = parseSalesCsv(salesHeader + '\n' + salesLine + '\n' + salesLine).rows; assert.equal(rows[1].rowHash, again[1].rowHash);
});
test('reporting month requires a valid month and explicit year', () => {
  const { reportingMonth } = load('lib/sales/csv.ts');
  assert.equal(reportingMonth('2026-05').toISOString(), '2026-05-01T00:00:00.000Z');
  for (const value of ['May', '2026-13', '2026-00', '26-05', '', null]) assert.throws(() => reportingMonth(value));
});
test('sales imports reject unauthenticated and wrong-role users before reading files or DB', async () => {
  for (const role of [null, 'main_admin', 'recovery_admin', 'recovery_executive', 'team_leader']) {
    let touched = false;
    const api = load('app/api/sales-executives/imports/route.ts', { user: role ? { ...member, app_metadata: { role } } : null, onDb: () => { touched = true; } });
    const result = await api.POST(request()); assert.equal(result.status, role ? 403 : 401); assert.equal(touched, false);
  }
});
function csvRequest(text, action = 'preview') {
  const form = new FormData(); form.set('month', '2026-05'); form.set('action', action); form.set('file', new File([text], 'sales.csv', { type: 'text/csv' }));
  const req = new Request('http://localhost:3000/api/sales-executives/imports', { method: 'POST', headers: { origin: 'http://localhost:3000' }, body: form }); req.nextUrl = new URL(req.url); return req;
}
test('CSV preview validates without writing records', async () => {
  let touched = false;
  const api = load('app/api/sales-executives/imports/route.ts', { user: member, onDb: () => { touched = true; } });
  const result = await api.POST(csvRequest(salesHeader + '\n' + salesLine));
  assert.equal(result.status, 200); assert.equal(result.body.totalRows, 1); assert.equal(result.body.preview[0].rowHash, undefined); assert.equal(touched, false);
});
test('CSV import saves imperfect rows and their original cell contents', async () => {
  let stored;
  const tx = { salesImport: { create: async () => ({ id: 'batch-id' }), update: async () => ({}) }, salesRecord: { createMany: async input => { stored = input.data; return { count: input.data.length }; } } };
  const api = load('app/api/sales-executives/imports/route.ts', { user: member, db: { $transaction: async callback => callback(tx) } });
  const result = await api.POST(csvRequest(salesHeader + '\n' + salesLine + '\n31-02-2026,,College,not-an-email,123,call later,Self Paced,unknown,1500,', 'import'));
  assert.equal(result.status, 201); assert.equal(result.body.imported, 2); assert.equal(stored[1].name, ''); assert.equal(stored[1].emailId, 'not-an-email'); assert.equal(stored[1].phone, '123'); assert.equal(stored[1].whatsapp, 'call later'); assert.equal(stored[1].dateFromCsv, null); assert.equal(stored[1].totalAmountPaise, null); assert.equal(stored[1].rawValues.totalAmountPaise, 'unknown');
});
test('CSV import assigns server owner/month, skips duplicates, and updates batch count', async () => {
  let inserted, batchCount;
  const tx = { salesImport: { create: async () => ({ id: 'batch-id' }), update: async input => { batchCount = input.data.rowCount; } }, salesRecord: { createMany: async input => { inserted = input; return { count: 1 }; } } };
  const api = load('app/api/sales-executives/imports/route.ts', { user: member, db: { $transaction: async callback => callback(tx) } });
  const result = await api.POST(csvRequest(salesHeader + '\n' + salesLine + '\n' + salesLine, 'import'));
  assert.equal(result.status, 201); assert.equal(result.body.imported, 1); assert.equal(result.body.skipped, 1); assert.equal(batchCount, 1); assert.equal(inserted.skipDuplicates, true); assert.equal(inserted.data[0].ownerId, member.id); assert.equal(inserted.data[0].reportingMonth.toISOString(), '2026-05-01T00:00:00.000Z');
});
test('sales listing scopes every query to owner and selected month', async () => {
  let query, counter;
  const db = { salesRecord: { findMany: async input => { query = input; return []; }, count: async input => { counter = input; return 0; } }, $transaction: async values => Promise.all(values) };
  const req = { nextUrl: new URL('http://localhost:3000/api/sales-executives/imports?month=2026-05') };
  const result = await load('app/api/sales-executives/imports/route.ts', { user: member, db }).GET(req);
  assert.equal(result.status, 200); assert.equal(query.where.ownerId, member.id); assert.equal(counter.where.ownerId, member.id); assert.equal(query.take, 25);
});

test('team leaders can preview their own CSV through their role endpoint', async () => {
  const api = load('app/api/team-lead/imports/route.ts', { user: { ...member, app_metadata: { role: 'team_leader' } } });
  const result = await api.POST(csvRequest(salesHeader + '\n' + salesLine)); assert.equal(result.status, 200); assert.equal(result.body.totalRows, 1);
});
test('sales upload rejects cross-origin and oversized requests', async () => {
  const api = load('app/api/sales-executives/imports/route.ts', { user: member });
  const crossOrigin = csvRequest(salesHeader + '\n' + salesLine); crossOrigin.headers.set('origin', 'https://other.example');
  assert.equal((await api.POST(crossOrigin)).status, 403);
  const oversized = csvRequest(salesHeader + '\n' + salesLine); oversized.headers.set('content-length', '6000000');
  assert.equal((await api.POST(oversized)).status, 413);
});

test('CSV import preserves casing, spaces, and long cell values', () => {
  const { parseSalesCsv } = load('lib/sales/csv.ts');
  const result = parseSalesCsv(salesHeader + '\n17-05-2026,"  Example  ",College,Mixed@Example.COM,"not a number",,Self Paced,4500,1500,"' + 'x'.repeat(6000) + '"');
  const row = result.rows[0]; assert.equal(row.name, '  Example  '); assert.equal(row.emailId, 'Mixed@Example.COM'); assert.equal(row.phone, 'not a number'); assert.equal(row.comments.length, 6000);
});

test('missing CSV raw-value column identifies the exact pending migration', () => {
  const { apiError } = load('lib/auth/http.ts');
  const result = apiError({ code: 'P2022', meta: { modelName: 'SalesRecord', column: 'sales_records.raw_values' } });
  assert.equal(result.status, 503); assert.equal(result.body.code, 'SALES_SCHEMA_OUTDATED'); assert.match(result.body.error, /202611250003_preserve_csv_values/);
});

test('admin sales endpoints reject signed-out and non-admin users before data access', async () => {
  for (const role of [null, 'sales_executive', 'team_leader', 'recovery_admin', 'recovery_executive']) {
    let touched = false;
    const options = { user: role ? { ...member, app_metadata: { role } } : null, onDb: () => { touched = true; }, onAdminClient: () => { touched = true; } };
    assert.equal((await load('app/api/main-admin/sales/route.ts', options).GET({ nextUrl: new URL('http://localhost:3000/api/main-admin/sales') })).status, role ? 403 : 401);
    assert.equal((await load('app/api/main-admin/sales/options/route.ts', options).GET()).status, role ? 403 : 401); assert.equal(touched, false);
  }
});
test('admin sales combines team, owner, month, and pagination filters', async () => {
  const teamId = '33333333-3333-4333-8333-333333333333'; let query, count;
  const db = { teamMembership: { findMany: async input => input.where.teamId ? [{ userId: member.id }] : [{ userId: member.id, team: { id: teamId, name: 'North' } }] }, salesRecord: { findMany: async input => { query = input; return [{ id: 'sale', ownerId: member.id }]; }, count: async input => { count = input; return 60; } }, $transaction: async values => Promise.all(values) };
  const api = load('app/api/main-admin/sales/route.ts', { user: mainAdmin, admin: { getUserById: async () => ({ data: { user: member } }) }, db });
  const result = await api.GET({ nextUrl: new URL(`http://localhost:3000/api/main-admin/sales?teamId=${teamId}&ownerId=${member.id}&month=2026-05&page=2`) });
  assert.equal(result.status, 200); assert.equal(query.where.ownerId.in[0], member.id); assert.equal(query.where.AND[0].ownerId, member.id); assert.equal(query.where.reportingMonth.toISOString(), '2026-05-01T00:00:00.000Z'); assert.equal(count.where, query.where); assert.equal(query.skip, 25); assert.equal(query.take, 25); assert.equal(result.body.records[0].owner.email, member.email); assert.equal(result.body.records[0].team.name, 'North'); assert.equal(result.body.hasMore, true);
});
test('admin sales unassigned filter excludes current team members', async () => {
  let query;
  const db = { teamMembership: { findMany: async () => [{ userId: member.id }] }, salesRecord: { findMany: async input => { query = input; return []; }, count: async () => 0 }, $transaction: async values => Promise.all(values) };
  const result = await load('app/api/main-admin/sales/route.ts', { user: mainAdmin, admin: {}, db }).GET({ nextUrl: new URL('http://localhost:3000/api/main-admin/sales?teamId=unassigned') });
  assert.equal(result.status, 200); assert.equal(query.where.ownerId.notIn[0], member.id); assert.equal(query.where.reportingMonth, undefined);
});
test('admin sales validates filter inputs before database reads', async () => {
  let touched = false;
  const api = load('app/api/main-admin/sales/route.ts', { user: mainAdmin, admin: {}, onDb: () => { touched = true; } });
  for (const search of ['teamId=bad', 'ownerId=bad', 'month=2026-13', 'page=0']) assert.equal((await api.GET({ nextUrl: new URL('http://localhost:3000/api/main-admin/sales?' + search) })).status, 400);
  assert.equal(touched, false);
});
test('admin sales filter options include team leaders and paginate through Auth users', async () => {
  const pages = [];
  const leader = { ...member, id: '33333333-3333-4333-8333-333333333333', app_metadata: { role: 'team_leader' } };
  const db = { team: { findMany: async () => [] }, salesRecord: { findMany: async input => input.distinct[0] === 'reportingMonth' ? [{ reportingMonth: new Date('2026-05-01T00:00:00Z') }] : [] }, $transaction: async values => Promise.all(values) };
  const api = load('app/api/main-admin/sales/options/route.ts', { user: mainAdmin, db, admin: { listUsers: async ({ page }) => { pages.push(page); return { data: { users: page === 1 ? [member] : [leader, mainAdmin], nextPage: page === 1 ? 2 : null } }; } } });
  const result = await api.GET(); assert.equal(result.status, 200); assert.equal(pages.join(','), '1,2'); assert.equal(result.body.people.length, 2); assert.equal(result.body.months[0], '2026-05');
});
