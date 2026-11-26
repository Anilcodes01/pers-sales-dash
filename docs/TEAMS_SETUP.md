# Teams database setup

Team data uses Next.js APIs → Prisma → Supabase Postgres. Supabase Auth still manages account credentials and trusted roles. No Supabase data client or database function is used for team CRUD.

## Environment

Add `DATABASE_URL` and `DIRECT_URL` to `.env` as shown in `.env.example`. Copy the actual URLs from your Supabase project's **Connect** panel rather than guessing the pooler hostname. Use the transaction pooler URL with `pgbouncer=true` for runtime traffic, and the direct connection or session-mode pooler URL for migrations (session mode can be useful when direct IPv6 is unavailable). URL-encode special characters in the database password. Never use a `NEXT_PUBLIC_` prefix.

## Apply the migration

The migration creates `public.teams` and `public.team_memberships`, references existing Supabase Auth users, and enables RLS with no direct browser permissions. It does not change existing users, credentials, or roles. Use a trusted server database connection with permission to access these tables.

Preferred path, after filling in environment values:

```sh
npx prisma generate
npx prisma migrate deploy
```

Alternatively, run the exact contents of `prisma/migrations/202611250001_teams/migration.sql` in the Supabase SQL Editor. Then mark that migration applied locally:

```sh
npx prisma migrate resolve --applied 202611250001_teams
```

Choose one application path; do not execute the SQL again after `migrate deploy`. These commands are setup instructions, not commands already executed against your database. Client generation has been completed locally; no live migration was run.

The SQL contains foreign keys into the Supabase-managed `auth.users` table. Prisma models intentionally keep Auth user IDs as scalars rather than taking ownership of Supabase's Auth schema. Preserve these migration-owned constraints in future migrations; do not use `db push` to overwrite database structure.

## Workflow

1. Main admin opens **Teams** in the sidebar, chooses **Create team**, and enters a unique name. Names are trimmed, whitespace-normalized, and compared case-insensitively.
2. Open **Team accounts**, select a user's team/“Assign team” cell, choose a team, and save.
3. Select another team to reassign, or “No team” to remove the assignment. Each user has one current team; teams may have many users. Assigning a team does not change the user's role or grant additional dashboard permissions yet.
4. **Create user** and **Manage** open animated dialogs; only one password field is used, with an eye icon to show/hide it. Existing users and account creation remain available if team database setup is pending.

Only main admin can list/create teams or change memberships. Existing users require no backfill: they start unassigned. Removing an Auth user cascades its membership; team creation/assignment actor references become null if that actor is deleted. Team deletion is not exposed in this feature.

API routes: `GET/POST /api/main-admin/teams`, `PATCH /api/main-admin/users/[id]/team` with `{ "teamId": "uuid" }` or `{ "teamId": null }`.

Verify after migration: create teams, reject duplicate names, assign/reassign/unassign existing users, reload to verify persistence/counts, and confirm non-admin requests are denied. No server is started automatically.
