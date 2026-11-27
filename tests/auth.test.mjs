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
    vm.runInNewContext(code, { exports, URL, performance, Buffer, Response, File, TextDecoder, process: { env: options.env || {} }, require(name) {
      if (options.modules && Object.hasOwn(options.modules, name)) return options.modules[name];
      if (name === 'server-only') return {};
      if (name === '@/lib/db') return { db: () => { options.onDb?.(); return options.db; } };
      if (name === 'next/navigation') return { redirect: (destination) => { throw new Error(`REDIRECT:${destination}`); } };
      if (name === 'csv-parse/sync') return { parse };
      if (name === 'node:crypto') return { createHash, randomUUID: () => 'new-version' };
      if (name === 'next/server') return { after: callback => { options.onAfter?.(callback); }, connection: async () => { options.onConnection?.(); }, NextResponse: { json: (body, extra) => ({ body, ...extra, headers: { ...extra?.headers, set(name, value) { this[name] = value; } } }) } };
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

 test('Amplify public origin reaches credential validation behind internal host', async () => {
  const result = await load(authFile, { env: { APP_URL: 'https://main.example.amplifyapp.com' }, client: { auth: { signInWithPassword: async () => ({ error: { status: 400 } }) } } }).POST(request({ email: member.email, password: 'incorrect' }, 'https://main.example.amplifyapp.com', 'http://internal:3000/api/auth/login'), context('login'));
  assert.equal(result.status, 401);
});
test('configured public origin rejects other origins and forged forwarded hosts', () => {
  const { isAllowedOrigin } = load('lib/auth/origin.ts', { env: { APP_URL: 'https://main.example.amplifyapp.com/' } });
  const req = request({}, 'https://evil.example');
  req.headers.set('x-forwarded-host', 'evil.example');
  assert.equal(isAllowedOrigin(req), false);
  req.headers.delete('origin'); assert.equal(isAllowedOrigin(req), false);
  req.headers.set('origin', 'null'); assert.equal(isAllowedOrigin(req), false);
  req.headers.set('origin', 'https://main.example.amplifyapp.com/path'); assert.equal(isAllowedOrigin(req), false);
  req.headers.set('origin', 'https://main.example.amplifyapp.com'); assert.equal(isAllowedOrigin(req), true);
});
test('invalid APP_URL fails closed', () => {
  assert.equal(load('lib/auth/origin.ts', { env: { APP_URL: 'invalid' } }).isAllowedOrigin(request()), false);
});

const recoveryFile = 'app/api/recovery-admin/leads/route.ts';
const recoveryHeader = fs.readFileSync('public/recovery-leads-template.csv', 'utf8').trim();
const recoveryLine = 'unknown date,,+91 123,not-an-email,,Executive,amount pending,Plan,Domain,May,Yes,1000,Pending,New,Follow up,3500,';
test('recovery CSV preserves all cells, blanks, and repeated students', () => {
  const { parseRecoveryCsv } = load('lib/recovery/csv.ts');
  const rows = parseRecoveryCsv(recoveryHeader + '\n' + recoveryLine + '\n' + recoveryLine);
  assert.equal(rows.length, 2); assert.equal(rows[0].studentName, '');
  assert.equal(rows[0].studentPhone, '+91 123'); assert.equal(rows[0].amountMentioned, 'amount pending');
  assert.equal(rows[0].timestamp, 'unknown date'); assert.equal(rows[0].studentEmail, 'not-an-email');
  assert.throws(() => parseRecoveryCsv('Student Name\nExample'), /column/);
  assert.throws(() => parseRecoveryCsv(recoveryHeader + '\n' + Array(5001).fill(recoveryLine).join('\n')), /5,000/);
});
test('recovery leads reject all other roles before database access', async () => {
  for (const user of [null, member, mainAdmin, { ...member, app_metadata: { role: 'team_leader' } }, { ...member, app_metadata: { role: 'recovery_executive' } }]) {
    const handlers = load(recoveryFile, { user, onDb: () => assert.fail('database accessed') });
    assert.equal((await handlers.GET(request())).status, user ? 403 : 401);
    assert.equal((await handlers.POST(csvRequest(recoveryHeader + '\n' + recoveryLine))).status, user ? 403 : 401);
  }
});
test('recovery preview does not save and import retains every student under authenticated uploader', async () => {
  const user = { ...member, app_metadata: { role: 'recovery_admin' } };
  let saved;
  const handlers = load(recoveryFile, { user, db: { $transaction: async callback => callback({ recoveryLead: { createMany: async ({ data }) => { saved = data; return { count: data.length }; } } }) } });
  const preview = await handlers.POST(csvRequest(recoveryHeader + '\n' + recoveryLine));
  assert.equal(preview.body.totalRows, 1); assert.equal(saved, undefined);
  const req = csvRequest(recoveryHeader + '\n' + recoveryLine + '\n' + recoveryLine, 'import');
  const result = await handlers.POST(req);
  assert.equal(result.status, 201); assert.equal(result.body.imported, 2);
  assert.equal(saved.length, 2); assert.equal(saved[0].uploadedBy, member.id);
});
test('recovery upload rejects foreign origins and invalid files before storage', async () => {
  const handlers = load(recoveryFile, { user: { ...member, app_metadata: { role: 'recovery_admin' } }, onDb: () => assert.fail('database accessed') });
  const cross = csvRequest(recoveryHeader + '\n' + recoveryLine); cross.headers.set('origin', 'https://other.example');
  assert.equal((await handlers.POST(cross)).status, 403);
  assert.equal((await handlers.POST(csvRequest('wrong header\nvalue'))).status, 400);
  const oversized = csvRequest(recoveryHeader); oversized.headers.set('content-length', String(6 * 1024 * 1024));
  assert.equal((await handlers.POST(oversized)).status, 413);
});

const recoveryAdmin = { ...member, app_metadata: { role: 'recovery_admin' } };
const recoveryExecutive = { ...member, app_metadata: { role: 'recovery_executive' } };
test('allocation endpoints deny other roles before database or privileged Auth access', async () => {
  for (const user of [null, member, mainAdmin, recoveryExecutive]) {
    const options = { user, onDb: () => assert.fail('database accessed'), onAdminClient: () => assert.fail('Auth admin accessed') };
    const route = load('app/api/recovery-admin/allocation/route.ts', options);
    assert.equal((await route.GET(request())).status, user ? 403 : 401);
    assert.equal((await route.POST(request())).status, user ? 403 : 401);
    assert.equal((await load('app/api/recovery-admin/allocation/options/route.ts', options).GET()).status, user ? 403 : 401);
  }
});
test('allocation validates target role and updates only selected students in the chosen month', async () => {
  let update;
  const options = { user: recoveryAdmin, admin: { getUserById: async () => ({ data: { user: recoveryExecutive }, error: null }) }, db: { $transaction: async callback => callback({ recoveryLead: { count: async () => 1, updateMany: async args => { update = args; return { count: 1 }; } } }) } };
  const { allocateLeads } = load('lib/recovery/allocation.ts', options);
  assert.equal((await allocateLeads(mainAdmin.id, { ids: [member.id], month: 'May', assignedTo: member.id })).updated, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(update.where)), { id: { in: [member.id] }, selectedMonth: 'May' });
  assert.equal(update.data.assignedTo, member.id); assert.equal(update.data.assignedBy, mainAdmin.id);
  await allocateLeads(mainAdmin.id, { ids: [member.id], month: 'May', assignedTo: null }); assert.equal(update.data.assignedTo, null);
  await assert.rejects(() => allocateLeads(mainAdmin.id, { ids: [], month: 'May', assignedTo: member.id }), /Select 1/);
  const wrongRole = load('lib/recovery/allocation.ts', { admin: { getUserById: async () => ({ data: { user: member } }) }, onDb: () => assert.fail('database accessed') });
  await assert.rejects(() => wrongRole.allocateLeads(mainAdmin.id, { ids: [member.id], month: 'May', assignedTo: member.id }), /active recovery executive/);
});
test('allocation rejects students outside the selected month without updating', async () => {
  const { allocateLeads } = load('lib/recovery/allocation.ts', { db: { $transaction: async callback => callback({ recoveryLead: { count: async () => 0, updateMany: () => assert.fail('updated mismatched students') } }) } });
  await assert.rejects(() => allocateLeads(mainAdmin.id, { ids: [member.id], month: 'June', assignedTo: null }), /no longer in this month/);
});
test('executive call list always scopes records and counts to signed-in assignee', async () => {
  const queries = [];
  const handlers = load('app/api/recovery-executive/leads/route.ts', { user: recoveryExecutive, db: { recoveryLead: { findMany: args => { queries.push(args); return []; }, count: args => { queries.push(args); return 0; } }, $transaction: async values => Promise.all(values) } });
  const response = await handlers.GET(request({}, 'http://localhost:3000', `http://localhost:3000/api/recovery-executive/leads?assignedTo=${mainAdmin.id}`));
  assert.equal(response.body.total, 0);
  for (const query of queries) assert.equal(query.where.assignedTo, member.id);
  assert.equal(queries[0].skip, undefined); assert.equal(queries[0].take, undefined);
  assert.equal((await load('app/api/recovery-executive/leads/route.ts', { user: recoveryAdmin, onDb: () => assert.fail('database accessed') }).GET(request())).status, 403);
});
test('allocation POST rejects foreign origins even for recovery admin', async () => {
  const route = load('app/api/recovery-admin/allocation/route.ts', { user: recoveryAdmin, onDb: () => assert.fail('database accessed') });
  assert.equal((await route.POST(request({}, 'https://other.example'))).status, 403);
});
test('allocation listing returns the entire selected CSV month without pagination', async () => {
  let query;
  const route = load('app/api/recovery-admin/allocation/route.ts', { user: recoveryAdmin, db: { recoveryLead: { findMany: args => { query = args; return []; }, count: () => 110 }, $transaction: async values => Promise.all(values) } });
  const result = await route.GET(request({}, 'http://localhost:3000', 'http://localhost:3000/api/recovery-admin/allocation?month=May&page=2'));
  assert.equal(query.where.selectedMonth, 'May'); assert.equal(query.skip, undefined); assert.equal(query.take, undefined); assert.equal(result.body.total, 110);
});
test('allocation accepts a full-month selection larger than 100 students', async () => {
  const ids = Array.from({ length: 335 }, (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`);
  let updated;
  const { allocateLeads } = load('lib/recovery/allocation.ts', { db: { $transaction: async callback => callback({ recoveryLead: { count: async () => ids.length, updateMany: async args => { updated = args.where.id.in; return { count: ids.length }; } } }) } });
  assert.equal((await allocateLeads(mainAdmin.id, { ids, month: 'November', assignedTo: null })).updated, 335);
  assert.equal(updated.length, 335);
});
test('allocation JSON body limit permits a full month while ordinary admin requests remain bounded', async () => {
  const { readAdminBody } = load('lib/auth/http.ts');
  const body = { ids: Array.from({ length: 335 }, () => member.id), month: 'November', assignedTo: null };
  await assert.rejects(() => readAdminBody(request(body)), /too large/);
  assert.equal((await readAdminBody(request(body), 1024 * 1024)).ids.length, 335);
});
test('spreadsheet range selection works forwards, backwards, and with additive ranges', () => {
  const { selectionRange } = load('lib/recovery/selection.ts');
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const plain = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(selectionRange(ids, 1, 3)), ['b', 'c', 'd']);
  assert.deepEqual(plain(selectionRange(ids, 3, 1)), ['b', 'c', 'd']);
  assert.deepEqual(plain(selectionRange(ids, 1, 1)), ['b']);
  assert.deepEqual(plain(selectionRange(ids, 1, 2, ['e', 'b'])), ['e', 'b', 'c']);
  assert.deepEqual(plain(selectionRange(ids, 1, 2)), ['b', 'c']);
});

const statusFile = 'app/api/recovery-executive/leads/[id]/route.ts';
const statusContext = { params: Promise.resolve({ id: member.id }) };
test('status updates require a recovery executive and reject cross-origin requests', async () => {
  for (const user of [null, member, mainAdmin, recoveryAdmin]) {
    const route = load(statusFile, { user, onDb: () => assert.fail('database accessed') });
    assert.equal((await route.PATCH(request({ paymentStatus: 'paid' }), statusContext)).status, user ? 403 : 401);
  }
  const route = load(statusFile, { user: recoveryExecutive, onDb: () => assert.fail('database accessed') });
  assert.equal((await route.PATCH(request({ paymentStatus: 'paid' }, 'https://other.example'), statusContext)).status, 403);
});
test('executive status writes are scoped atomically to the current assignee and only change provided fields', async () => {
  let query;
  const route = load(statusFile, { user: recoveryExecutive, db: { recoveryLead: { updateMany: async args => { query = args; return { count: 1 }; } } } });
  const result = await route.PATCH(request({ paymentStatus: 'paid' }), statusContext);
  assert.equal(result.body.paymentStatus, 'paid'); assert.equal(query.where.id, member.id); assert.equal(query.where.assignedTo, recoveryExecutive.id);
  assert.equal(query.data.leadStatus, undefined); assert.ok(query.data.updatedAt);
  const custom = await route.PATCH(request({ comments: 'Call next Friday' }), statusContext);
  assert.equal(custom.body.comments, 'Call next Friday'); assert.equal(query.data.leadStatus, undefined); assert.equal(query.data.paymentStatus, undefined);
});
test('status update fails safely after reassignment without leaking other students', async () => {
  const route = load(statusFile, { user: recoveryExecutive, db: { recoveryLead: { updateMany: async () => ({ count: 0 }) } } });
  assert.equal((await route.PATCH(request({ leadStatus: 'called' }), statusContext)).status, 404);
});
test('status validation rejects invalid payments, blank or long custom statuses, and other fields', async () => {
  const route = load(statusFile, { user: recoveryExecutive, onDb: () => assert.fail('database accessed') });
  for (const body of [{ paymentStatus: 'anything' }, { leadStatus: '' }, { leadStatus: '   ' }, { leadStatus: 'x'.repeat(201) }, { assignedTo: mainAdmin.id }, { studentPhone: '123' }, {}]) {
    assert.equal((await route.PATCH(request(body), statusContext)).status, 400);
  }
});
test('recovery overview denies other roles before data or privileged Auth access', async () => {
  for (const user of [null, member, mainAdmin, recoveryExecutive]) {
    const route = load('app/api/recovery-admin/overview/route.ts', { user, onDb: () => assert.fail('database accessed'), onAdminClient: () => assert.fail('Auth accessed') });
    assert.equal((await route.GET(request())).status, user ? 403 : 401);
  }
});
test('recovery overview returns full records and filters exact CSV months including blanks', async () => {
  const queries = [];
  const database = { recoverySheetChange: { aggregate: async () => ({ _max: { id: 0n } }) }, recoveryLead: { findMany: async query => { queries.push(query); return []; } } };
  database.$transaction = callback => callback(database);
  const route = load('app/api/recovery-admin/overview/route.ts', { user: recoveryAdmin, admin: { listUsers: async () => ({ data: { users: [] }, error: null }) }, db: database });
  for (const suffix of ['', '?month=November', '?month=']) {
    queries.length = 0;
    const result = await route.GET(request({}, 'http://localhost:3000', `http://localhost:3000/api/recovery-admin/overview${suffix}`));
    assert.equal(result.status, 200); assert.equal(queries[0].take, undefined); assert.equal(queries[0].skip, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(queries[0].where)), suffix === '' ? {} : { selectedMonth: suffix === '?month=' ? '' : 'November' });
  }
});
test('shared status colors cover every preset and normalize imported casing', () => {
  const { statusColors } = load('lib/recovery/status-colors.ts');
  const { leadStatuses, paymentStatuses } = load('lib/recovery/statuses.ts');
  for (const field of ['paymentStatus', 'leadStatus']) {
    for (const value of field === 'paymentStatus' ? paymentStatuses : leadStatuses) {
      const color = statusColors(field, value);
      assert.notEqual(color.backgroundColor, statusColors(field, 'custom example').backgroundColor);
      assert.equal(color.backgroundColor, statusColors(field, ` ${value.toUpperCase()} `).backgroundColor);
    }
  }
});
test('appearance preferences save only the signed-in user theme color', async () => {
  let update;
  const route = load('app/api/account/appearance/route.ts', { user: member, client: { auth: { updateUser: async args => { update = args; return { error: null }; } } } });
  assert.equal((await route.PATCH(request({ color: 'orange' }))).body.color, 'orange');
  assert.deepEqual(JSON.parse(JSON.stringify(update)), { data: { theme_color: 'orange' } });
  assert.equal((await route.PATCH(request({ color: 'orange', role: 'main_admin' }))).status, 400);
  assert.equal((await route.PATCH(request({ color: 'invalid' }))).status, 400);
  assert.equal((await route.PATCH(request({ color: 'blue' }, 'https://other.example'))).status, 403);
  assert.equal((await load('app/api/account/appearance/route.ts').PATCH(request({ color: 'blue' }))).status, 401);
});

test('custom messages use comments, allow clearing, and cannot become lead statuses', async () => {
  let query;
  const route = load(statusFile, { user: recoveryExecutive, db: { recoveryLead: { updateMany: async args => { query = args; return { count: 1 }; } } } });
  assert.equal((await route.PATCH(request({ leadStatus: 'custom message' }), statusContext)).status, 400);
  assert.equal((await route.PATCH(request({ comments: 'Call tomorrow' }), statusContext)).body.comments, 'Call tomorrow');
  assert.equal(query.data.leadStatus, undefined); assert.equal(query.where.assignedTo, member.id);
  assert.equal((await route.PATCH(request({ comments: '' }), statusContext)).body.comments, '');
  assert.equal((await route.PATCH(request({ comments: 'x'.repeat(5001) }), statusContext)).status, 400);
});
test('recovery totals use full mentioned amount only for paid students and retain every current status', () => {
  const { summarizeRecovery, amountInPaise } = load('lib/recovery/summary.ts');
  const row = { assignedTo: member.id, amountMentioned: '₹4,500/-', paymentStatus: ' PAID ', leadStatus: ' Not Answered ' };
  const result = summarizeRecovery([row, { ...row, paymentStatus: 'unpaid', leadStatus: 'called' }, { ...row, paymentStatus: 'default', leadStatus: 'affirmed' }, { ...row, amountMentioned: 'unknown', leadStatus: 'custom imported status' }]);
  assert.equal(result.recoveredPaise, 450000); assert.equal(result.paid, 2); assert.equal(result.unpaid, 1); assert.equal(result.default, 1); assert.equal(result.excludedAmounts, 1);
  assert.equal(result.statuses['not answered'], 1); assert.equal(result.statuses.called, 1); assert.equal(result.statuses.affirmed, 1); assert.equal(result.statuses['custom imported status'], 1); assert.equal(result.statuses.busy, 0);
  assert.equal(amountInPaise('INR 1,234.56'), 123456); assert.equal(amountInPaise(''), null); assert.equal(amountInPaise('-100'), null);
});
test('recovery leaderboard ranks by amount and keeps unassigned rows only in overall totals', () => {
  const { recoveryLeaderboard, summarizeRecovery } = load('lib/recovery/summary.ts');
  const row = { assignedTo: member.id, amountMentioned: '1000', paymentStatus: 'paid', leadStatus: 'called' };
  const rows = [row, { ...row, assignedTo: mainAdmin.id, amountMentioned: '2000' }, { ...row, assignedTo: null, amountMentioned: '500' }];
  const leaders = recoveryLeaderboard(rows, [{ id: member.id, name: 'First', email: '' }, { id: mainAdmin.id, name: 'Second', email: '' }]);
  assert.equal(leaders[0].id, mainAdmin.id); assert.equal(leaders[0].recoveredPaise, 200000); assert.equal(leaders[1].total, 1); assert.equal(summarizeRecovery(rows).recoveredPaise, 350000);
  assert.equal(summarizeRecovery([{ ...row, leadStatus: '__proto__' }]).statuses.__proto__, 1);
});
test('recovery percentage is paid student share and handles empty scopes', () => {
  const { summarizeRecovery } = load('lib/recovery/summary.ts');
  const row = { assignedTo: member.id, amountMentioned: '100', paymentStatus: 'paid', leadStatus: 'called' };
  assert.equal(summarizeRecovery([]).recoveryPercentage, 0);
  assert.equal(summarizeRecovery([row]).recoveryPercentage, 100);
  assert.equal(summarizeRecovery([row, { ...row, paymentStatus: 'unpaid' }, { ...row, paymentStatus: 'default' }, { ...row, paymentStatus: '' }]).recoveryPercentage, 25);
});
test('numbered allocation range uses inclusive one-based displayed row numbers', () => {
  const { numberedRowRange } = load('lib/recovery/selection.ts');
  assert.deepEqual(JSON.parse(JSON.stringify(numberedRowRange(['a', 'b', 'c', 'd'], '2', '4'))), ['b', 'c', 'd']);
  assert.equal(numberedRowRange(['a'], '1', '1')[0], 'a');
  for (const [first, last] of [['0', '2'], ['3', '2'], ['1', '5'], ['1.5', '2'], ['', '2']]) assert.throws(() => numberedRowRange(['a', 'b', 'c'], first, last));
});
test('range allocation skips assigned rows atomically unless reassignment is enabled', async () => {
  let query;
  const { allocateLeads } = load('lib/recovery/allocation.ts', { admin: { getUserById: async () => ({ data: { user: recoveryExecutive }, error: null }) }, db: { $transaction: async callback => callback({ recoveryLead: { count: async () => 2, updateMany: async args => { query = args; return { count: 1 }; } } }) } });
  const result = await allocateLeads(mainAdmin.id, { ids: [member.id, mainAdmin.id], month: 'November', assignedTo: member.id, reassign: false });
  assert.equal(query.where.assignedTo, null); assert.equal(query.where.selectedMonth, 'November'); assert.equal(result.updated, 1); assert.equal(result.skipped, 1);
  await assert.rejects(() => allocateLeads(mainAdmin.id, { ids: [member.id, mainAdmin.id], month: 'November', assignedTo: member.id, reassign: true }), /Allocation changed/);
  await assert.rejects(() => allocateLeads(mainAdmin.id, { ids: [member.id], month: 'November', assignedTo: member.id, reassign: 'false' }), /Invalid reassignment/);
});
test('default recovery month follows India time across month boundaries', () => {
  const { currentRecoveryMonth } = load('lib/recovery/month.ts');
  assert.equal(currentRecoveryMonth(new Date('2026-10-31T20:00:00Z')), 'November');
  assert.equal(currentRecoveryMonth(new Date('2026-11-30T18:00:00Z')), 'December');
  assert.equal(currentRecoveryMonth(new Date('2026-11-30T19:00:00Z')), 'December');
  assert.equal(currentRecoveryMonth(new Date('2026-11-24T18:29:59Z')), 'November');
  assert.equal(currentRecoveryMonth(new Date('2026-11-24T18:30:00Z')), 'December');
  assert.equal(currentRecoveryMonth(new Date('2026-12-24T18:30:00Z')), 'January');
});
test('daily recovery uses recorded paid dates in India time and excludes unknown historical dates', () => {
  const { dailyRecovery } = load('lib/recovery/summary.ts');
  const row = { assignedTo: member.id, amountMentioned: '4500', paymentStatus: 'paid', leadStatus: 'called', paidAt: '2026-11-25T20:00:00Z' };
  const result = dailyRecovery([row, { ...row, amountMentioned: '1000' }, { ...row, paidAt: null }, { ...row, paymentStatus: 'unpaid' }]);
  assert.equal(result.undated, 1); assert.equal(result.days.length, 1); assert.equal(result.days[0].date, '2026-11-26');
  assert.equal(result.days[0].recoveredPaise, 550000); assert.equal(result.days[0].paid, 2); assert.equal(result.days[0].recoveryPercentage, 50);
});
test('paid timestamps are recorded on transition, preserved for already-paid saves, and untouched by comments', async () => {
  const queries = [];
  const route = load(statusFile, { user: recoveryExecutive, db: { recoveryLead: { updateMany: async args => { queries.push(args); return { count: queries.length === 1 ? 0 : 1 }; } } } });
  await route.PATCH(request({ paymentStatus: 'paid' }), statusContext);
  assert.equal(queries.length, 2); assert.equal(queries[1].data.paidAt, undefined);
  queries.length = 0;
  const updates = [];
  const write = load(statusFile, { user: recoveryExecutive, db: { recoveryLead: { updateMany: async args => { updates.push(args); return { count: 1 }; } } } });
  await write.PATCH(request({ paymentStatus: 'paid' }), statusContext); assert.ok(updates[0].data.paidAt);
  await write.PATCH(request({ comments: 'follow-up' }), statusContext); assert.equal(updates[1].data.paidAt, undefined);
  await write.PATCH(request({ paymentStatus: 'unpaid' }), statusContext); assert.equal(updates[2].data.paidAt, null);
});
test('statistics endpoint returns aggregates without student details and scopes executive queries', async () => {
  const queries = [];
  const row = { assignedTo: member.id, amountMentioned: '1000', paymentStatus: 'paid', leadStatus: 'called', paidAt: null };
  const route = load('app/api/recovery-executive/statistics/route.ts', { user: recoveryExecutive, db: { recoveryLead: { findMany: async query => { queries.push(query); return query.distinct ? [{ selectedMonth: 'November' }] : [row]; } } } });
  const result = await route.GET(request({}, 'http://localhost:3000', 'http://localhost:3000/api/recovery-executive/statistics?month=November'));
  assert.equal(result.body.summary.paid, 1); assert.equal(result.body.records, undefined);
  assert.equal(queries[0].where.assignedTo, member.id); assert.equal(queries[0].where.selectedMonth, 'November');
  assert.equal(queries[0].select.studentPhone, undefined); assert.equal(queries[0].select.comments, undefined);
});
test('statistics endpoints reject wrong roles before database access', async () => {
  for (const [file, user] of [['app/api/recovery-admin/statistics/route.ts', recoveryExecutive], ['app/api/recovery-executive/statistics/route.ts', recoveryAdmin]]) {
    const route = load(file, { user, onDb: () => assert.fail('database accessed') });
    assert.equal((await route.GET(request())).status, 403);
  }
});
test('sheet selection maps to inclusive visible row bounds for the single allocation form', () => {
  const { selectedRowBounds, numberedRowRange } = load('lib/recovery/selection.ts');
  const ids = ['a', 'b', 'c', 'd'];
  assert.equal(selectedRowBounds(ids, []), null);
  const bounds = selectedRowBounds(ids, ['d', 'b']);
  assert.equal(bounds.first, 2); assert.equal(bounds.last, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(numberedRowRange(ids, String(bounds.first), String(bounds.last)))), ['b', 'c', 'd']);
  assert.equal(selectedRowBounds(ids, ['unknown']), null);
});

test('user and token verification start concurrently while retaining credential checks', async () => {
  let release;
  let userStarted = false;
  const gate = new Promise(resolve => { release = resolve; });
  const client = { auth: {
    getUser: async () => { userStarted = true; await gate; return { data: { user: member }, error: null }; },
    getClaims: async () => { assert.equal(userStarted, true); release(); return { data: { claims: { app_metadata: {} } }, error: null }; },
  } };
  assert.equal((await load('lib/auth/session.ts', { client, realSession: true }).currentUser()).id, member.id);
});

test('recovery CSV imports new payment fields and keeps payment links blank', () => {
  const { parseRecoveryCsv } = load('lib/recovery/csv.ts');
  const { leadColumns } = load('lib/recovery/columns.ts');
  const [row] = parseRecoveryCsv(recoveryHeader + '\n' + recoveryLine);
  assert.equal(row.amountPaid, '1000');
  assert.equal(row.remainingAmount, '3500');
  assert.equal(row.comments, 'Follow up');
  assert.equal(row.paymentLinks, '');
  assert.equal(row.registrationAmount, undefined);
  const keys = Object.keys(leadColumns);
  assert.equal(keys[keys.indexOf('referrals') + 1], 'amountPaid');
  assert.equal(keys[keys.indexOf('comments') + 1], 'remainingAmount');
  assert.equal(keys[keys.indexOf('remainingAmount') + 1], 'paymentLinks');
  assert.throws(() => parseRecoveryCsv(recoveryHeader.replace(',payment_links', '') + '\n' + recoveryLine), /payment_links column/);
  assert.throws(() => parseRecoveryCsv(recoveryHeader.replace(',Amount paid', '') + '\n' + recoveryLine), /Amount paid column/);
  const [linked] = parseRecoveryCsv(recoveryHeader + '\n' + recoveryLine + 'https://example.com/pay');
  assert.equal(linked.paymentLinks, 'https://example.com/pay');
});

const paymentLinkRoute = 'app/api/recovery-admin/payment-links/route.ts';
const paymentModules = {
  '@/lib/recovery/payment-links': { paymentConfig: () => ({ key: 'rzp_test_example', secret: 'secret' }), paymentJobView: async id => ({ id }) },
  '@/lib/recovery/payment-link-worker.mjs': { processPaymentBatch: async () => {} },
};
test('payment-link endpoints reject unauthenticated users and every non-recovery-admin role', async () => {
  for (const user of [null, member, mainAdmin, recoveryExecutive]) {
    const route = load(paymentLinkRoute, { user, modules: paymentModules, onDb: () => assert.fail('Unauthorized database access') });
    assert.equal((await route.GET(request())).status, user ? 403 : 401);
    assert.equal((await route.POST(request({ action: 'start', month: 'December' }))).status, user ? 403 : 401);
  }
});
test('payment-link generation rejects foreign origins before creating jobs', async () => {
  const route = load(paymentLinkRoute, { user: recoveryAdmin, modules: paymentModules, onDb: () => assert.fail('Database accessed for foreign origin') });
  assert.equal((await route.POST(request({ action: 'start', month: 'December' }, 'https://other.example'))).status, 403);
});
test('generation snapshots server balances for the selected month, never client-supplied amounts', async () => {
  let query; let created; let scheduled = false;
  const route = load(paymentLinkRoute, { user: recoveryAdmin, modules: paymentModules, onAfter: () => { scheduled = true; }, db: {
    recoveryPaymentJob: { findFirst: async () => null, create: async ({ data }) => { created = data; return { id: member.id }; } },
    recoveryLead: { findMany: async args => { query = args; return [{ id: member.id, studentName: 'Student', remainingAmount: '1500' }]; } },
  } });
  const result = await route.POST(request({ action: 'start', month: 'December', remainingAmount: '1', leadIds: ['other-student'] }));
  assert.equal(result.status, 200); assert.equal(result.body.job.id, member.id);
  assert.equal(query.where.selectedMonth, 'December');
  assert.equal(query.orderBy[0].createdAt, 'desc');
  assert.equal(query.orderBy[1].id, 'asc');
  assert.equal(created.items.createMany.data[0].remainingAmount, '1500');
  assert.equal(created.items.createMany.data[0].position, 0);
  assert.equal(created.createdBy, recoveryAdmin.id); assert.equal(scheduled, true);
});
test('existing running generation is resumed instead of creating another job', async () => {
  const route = load(paymentLinkRoute, { user: recoveryAdmin, modules: paymentModules, db: {
    recoveryPaymentJob: { findFirst: async () => ({ id: member.id }), create: async () => assert.fail('Duplicate job') },
    recoveryLead: { findMany: async () => assert.fail('Snapshot repeated') },
  } });
  const result = await route.POST(request({ action: 'start', month: 'December' }));
  assert.equal(result.body.job.id, member.id);
});

test('Stop generation changes shared job state without starting another provider batch', async () => {
  const writes = [];
  const route = load(paymentLinkRoute, { user: recoveryAdmin, modules: {
    ...paymentModules,
    '@/lib/recovery/payment-link-worker.mjs': { processPaymentBatch: async () => assert.fail('Stop must not process a new batch') },
  }, db: {
    recoveryPaymentJob: {
      findFirst: async () => ({ id: member.id, status: 'running' }),
      updateMany: async args => { writes.push(args); return { count: 1 }; },
    },
  } });
  const result = await route.POST(request({ action: 'stop', jobId: member.id }));
  assert.equal(result.status, 200);
  assert.equal(writes[0].where.accountKey, 'rzp_test_example');
  assert.equal(writes[0].data.status, 'stopping');
  assert.equal(writes[1].data.status, 'stopped');
  assert.equal(writes[1].where.OR.length, 2);
});
test('Resume generation only transitions stopped jobs', async () => {
  let condition;
  const route = load(paymentLinkRoute, { user: recoveryAdmin, modules: paymentModules, db: {
    recoveryPaymentJob: {
      findFirst: async () => ({ id: member.id, status: 'running' }),
      updateMany: async args => { condition = args.where; return { count: 0 }; },
    },
  } });
  assert.equal((await route.POST(request({ action: 'resume', jobId: member.id }))).status, 409);
  assert.equal(condition.status, 'stopped');
});

test('public Razorpay webhook rejects bad signatures before accessing the database', async () => {
  class InvalidWebhook extends Error { constructor() { super('Invalid webhook signature.'); this.status = 401; } }
  const route = load('app/api/webhooks/razorpay/route.ts', { modules: {
    '@/lib/recovery/payment-webhook.mjs': { verifyWebhook: () => { throw new InvalidWebhook(); }, handlePaymentWebhook: () => assert.fail('Unverified webhook processed'), WebhookError: InvalidWebhook },
  }, onDb: () => assert.fail('Unverified webhook accessed the database') });
  assert.equal((await route.POST(request({ event: 'payment_link.paid' }))).status, 401);
});
test('public Razorpay webhook bounds request size before verification and database access', async () => {
  const route = load('app/api/webhooks/razorpay/route.ts', { modules: {
    '@/lib/recovery/payment-webhook.mjs': { verifyWebhook: () => assert.fail('Oversized body verified'), handlePaymentWebhook: () => assert.fail('Oversized body processed'), WebhookError: class extends Error {} },
  }, onDb: () => assert.fail('Oversized webhook accessed the database') });
  assert.equal((await route.POST(request({ data: 'x'.repeat(270000) }))).status, 413);
});

test('setting CA atomically marks the allocated student paid, overriding a contradictory unpaid field', async () => {
  let update;
  const route = load(statusFile, { user: recoveryExecutive, db: { recoveryLead: { updateMany: async args => { update = args; return { count: 1 }; } } } });
  const response = await route.PATCH(request({ leadStatus: 'ca', paymentStatus: 'unpaid' }), statusContext);
  assert.equal(response.status, 200);
  assert.equal(update.where.assignedTo, recoveryExecutive.id);
  assert.equal(update.data.leadStatus, 'ca'); assert.equal(update.data.paymentStatus, 'paid');
  assert.ok(update.data.paidAt); assert.equal(response.body.paymentStatus, 'paid');
  assert.equal(update.data.amountPaid, undefined); assert.equal(update.data.remainingAmount, undefined);
});

test('executive amount/link replacement is unavailable to other roles', async () => {
  for (const user of [null, member, mainAdmin, recoveryAdmin]) {
    const route = load('app/api/recovery-executive/leads/[id]/payment-link/route.ts', { user, modules: {
      ...paymentModules,
      '@/lib/recovery/replace-payment-link.mjs': { replacePaymentLink: () => assert.fail('Unauthorized replacement'), LinkChangeError: class extends Error {} },
    }, onDb: () => assert.fail('Unauthorized database access') });
    assert.equal((await route.PATCH(request({ remainingAmount: '1500' }), statusContext)).status, user ? 403 : 401);
  }
});

const adminRecoveryUpdate = 'app/api/recovery-admin/leads/[id]/route.ts';
test('admin recovery editing denies all other roles before database access', async () => {
  for (const user of [null, member, mainAdmin, recoveryExecutive]) {
    const route = load(adminRecoveryUpdate, { user, onDb: () => assert.fail('Unauthorized DB access') });
    assert.equal((await route.PATCH(request({ paymentStatus: 'paid' }), statusContext)).status, user ? 403 : 401);
  }
});
test('recovery admin can update any lead status without an allocation filter', async () => {
  let query;
  const route = load(adminRecoveryUpdate, { user: recoveryAdmin, db: { recoveryLead: { updateMany: async args => { query = args; return { count: 1 }; } } } });
  const result = await route.PATCH(request({ paymentStatus: 'unpaid', leadStatus: 'discount' }), statusContext);
  assert.equal(result.status, 200); assert.equal(query.where.assignedTo, undefined);
  assert.equal(query.data.paymentStatus, 'unpaid'); assert.equal(query.data.paidAt, null);
  assert.equal(query.data.leadStatus, 'discount');
});
test('recovery admin CA marks Paid and paid timestamps survive repeated Paid saves', async () => {
  const queries = [];
  const route = load(adminRecoveryUpdate, { user: recoveryAdmin, db: { recoveryLead: { updateMany: async args => { queries.push({ ...args, data: { ...args.data } }); return { count: queries.length === 1 ? 0 : 1 }; } } } });
  const result = await route.PATCH(request({ leadStatus: 'ca' }), statusContext);
  assert.equal(result.status, 200); assert.equal(result.body.paymentStatus, 'paid');
  assert.ok(queries[0].data.paidAt); assert.equal(queries[1].data.paidAt, undefined);
});
test('recovery admin can save or clear an HTTPS link with replacement-lock protection', async () => {
  const queries = [];
  const route = load(adminRecoveryUpdate, { user: recoveryAdmin, db: { recoveryLead: { updateMany: async args => { queries.push(args); return { count: 1 }; } } } });
  const result = await route.PATCH(request({ paymentLinks: ' https://rzp.io/i/example ' }), statusContext);
  assert.equal(result.status, 200); assert.equal(result.body.paymentLinks, 'https://rzp.io/i/example');
  assert.equal(queries[0].where.OR.length, 2); assert.equal(queries[0].where.assignedTo, undefined);
  assert.equal(queries[0].data.remainingAmount, undefined); assert.equal(queries[0].data.amountPaid, undefined);
  assert.equal((await route.PATCH(request({ paymentLinks: '' }), statusContext)).body.paymentLinks, '');
});
test('admin recovery edits reject unsafe links, unknown statuses, and amount or allocation tampering', async () => {
  for (const body of [{ paymentLinks: 'javascript:alert(1)' }, { paymentLinks: 'http://example.com' }, { paymentLinks: 'https://user:pass@example.com' }, { paymentLinks: 'not a url' }, { paymentStatus: 'unknown' }, { leadStatus: 'custom' }, { remainingAmount: '1' }, { assignedTo: member.id }]) {
    const route = load(adminRecoveryUpdate, { user: recoveryAdmin, onDb: () => assert.fail('Invalid update accessed database') });
    assert.equal((await route.PATCH(request(body), statusContext)).status, 400);
  }
});
test('admin recovery link edits return a conflict while another update owns the lead', async () => {
  const route = load(adminRecoveryUpdate, { user: recoveryAdmin, db: { recoveryLead: { updateMany: async () => ({ count: 0 }) } } });
  assert.equal((await route.PATCH(request({ paymentLinks: 'https://rzp.io/i/example' }), statusContext)).status, 409);
});
test('admin recovery edits enforce same-origin requests', async () => {
  const route = load(adminRecoveryUpdate, { user: recoveryAdmin, onDb: () => assert.fail('Foreign origin accessed database') });
  assert.equal((await route.PATCH(request({ paymentStatus: 'paid' }, 'https://other.example'), statusContext)).status, 403);
});

test('unchanged overview sync avoids row downloads and the executive directory', async () => {
  const database = { recoverySheetChange: { aggregate: async () => ({ _max: { id: 12n } }) }, recoveryLead: { findMany: async () => assert.fail('Unchanged sheet queried all rows') } };
  database.$transaction = callback => callback(database);
  const route = load('app/api/recovery-admin/overview/route.ts', { user: recoveryAdmin, db: database, onAdminClient: () => assert.fail('Polling loaded the executive directory') });
  const result = await route.GET(request({}, 'http://localhost:3000', 'http://localhost:3000/api/recovery-admin/overview?month=December&cursor=12'));
  assert.equal(result.status, 200); assert.equal(result.body.unchanged, true); assert.equal(result.body.cursor, '12');
  assert.equal(result.body.records.length, 0);
});
test('overview delta handles updates, deletions, and month moves without a full reload', async () => {
  let changesQuery; let rowsQuery;
  const database = {
    recoverySheetChange: {
      aggregate: async () => ({ _max: { id: 15n } }),
      findMany: async query => { changesQuery = query; return [{ leadId: 'updated' }, { leadId: 'deleted' }, { leadId: 'moved' }]; },
    },
    recoveryLead: { findMany: async query => { rowsQuery = query; return [{ id: 'updated', selectedMonth: 'December' }]; } },
  };
  database.$transaction = callback => callback(database);
  const result = await load('lib/recovery/overview-sync.ts').overviewSnapshot(database, 'December', '12');
  assert.equal(result.cursor, '15'); assert.equal(result.reset, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.removedIds)), ['deleted', 'moved']);
  assert.equal(changesQuery.where.OR[0].oldMonth, 'December');
  assert.equal(changesQuery.where.OR[1].newMonth, 'December');
  assert.equal(rowsQuery.where.selectedMonth, 'December');
  assert.equal(rowsQuery.select.linkChangeToken, undefined);
  assert.equal(rowsQuery.select.registrationAmount, undefined);
});
test('sheet merge preserves row identities and touches only changed data', () => {
  const { mergeSheetRows } = load('lib/recovery/merge-sheet-rows.ts');
  const first = { id: 'a', createdAt: '2026-11-27', paymentStatus: 'unpaid' };
  const second = { id: 'b', createdAt: '2026-11-26', paymentStatus: 'unpaid' };
  const original = [first, second];
  assert.equal(mergeSheetRows(original, []), original);
  assert.equal(mergeSheetRows(original, [{ ...first }]), original);
  const updated = mergeSheetRows(original, [{ ...second, paymentStatus: 'paid' }]);
  assert.equal(updated[0], first); assert.notEqual(updated[1], second);
  const removed = mergeSheetRows(updated, [], ['a']);
  assert.equal(removed.length, 1); assert.equal(removed[0], updated[1]);
  const reset = mergeSheetRows(updated, [{ ...first }], [], true);
  assert.equal(reset.length, 1); assert.equal(reset[0], first);
});

test('sheet search returns page positions without returning student data', async () => {
  const ordered = Array.from({ length: 60 }, (_, i) => ({ id: `lead-${i}` }));
  const calls = [];
  const result = await load('app/api/recovery-admin/sheet-search/route.ts', {
    user: { ...member, app_metadata: { role: 'recovery_admin' } },
    db: { recoveryLead: { findMany: args => { calls.push(args); return Promise.resolve(args.where.OR ? [ordered[26], ordered[51]] : ordered); } }, $transaction: promises => Promise.all(promises) },
  }).GET(request({}, 'http://localhost:3000', 'http://localhost:3000/api/recovery-admin/sheet-search?scope=leads&q=pooja'));
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(result.body.matches)), [{ id: 'lead-26', index: 26, page: 2 }, { id: 'lead-51', index: 51, page: 3 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].select)), { id: true });
  assert.equal(calls[1].where.OR[0].timestamp.contains, 'pooja');
  assert.equal(calls[1].where.OR[0].timestamp.mode, 'insensitive');
});
test('executive recovered-sheet search applies assignment, paid, and month scopes', async () => {
  const user = { ...member, app_metadata: { role: 'recovery_executive' } };
  const calls = [];
  await load('app/api/recovery-executive/sheet-search/route.ts', {
    user, db: { recoveryLead: { findMany: args => { calls.push(args); return Promise.resolve([]); } }, $transaction: promises => Promise.all(promises) },
  }).GET(request({}, 'http://localhost:3000', 'http://localhost:3000/api/recovery-executive/sheet-search?scope=recovered&month=December&q=paid'));
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.where.assignedTo, user.id);
    assert.equal(call.where.paymentStatus.equals, 'paid');
    assert.equal(call.where.selectedMonth, 'December');
  }
  assert.equal(calls[0].orderBy[0].paidAt.nulls, 'last');
});
test('sheet search rejects unauthorized roles and invalid scopes before database access', async () => {
  for (const [user, path, scope, status] of [
    [member, 'recovery-admin', 'leads', 403],
    [null, 'recovery-admin', 'leads', 401],
    [{ ...member, app_metadata: { role: 'recovery_executive' } }, 'recovery-executive', 'leads', 400],
  ]) {
    let touched = false;
    const result = await load(`app/api/${path}/sheet-search/route.ts`, { user, onDb: () => { touched = true; } }).GET(request({}, 'http://localhost:3000', `http://localhost:3000/api/${path}/sheet-search?scope=${scope}&q=test`));
    assert.equal(result.status, status);
    assert.equal(touched, false);
  }
});

test('background sheet refresh preserves unchanged rows and server ordering', () => {
  const { reconcileSheetRows } = load('lib/recovery/merge-sheet-rows.ts');
  const original = [{ id: 'a', paymentStatus: 'paid' }, { id: 'b', paymentStatus: '' }];
  assert.equal(reconcileSheetRows(original, original.map(row => ({ ...row }))), original);
  const next = reconcileSheetRows(original, [{ ...original[1], paymentStatus: 'paid' }, { ...original[0] }]);
  assert.equal(next[0].id, 'b');
  assert.notEqual(next[0], original[1]);
  assert.equal(next[1], original[0]);
});
