# Sales and recovery dashboard — implementation tasks

Status: authentication, admin-managed accounts, teams, and monthly CSV sales imports for sales executives/team leaders are implemented. Sales import migration is prepared but not applied; see `SALES_CSV_SETUP.md`. Other business features remain planned. Do not start the server unless requested.

Approved auth rules: main admin creates confirmed accounts, assigns roles, and sets/resets passwords; members only log in/out. No public signup, verification email, member password-change/recovery flow, or readable password storage. See `AUTH_SETUP.md` for implementation and the provider-wide enforcement limitation.

## Project understanding

Build a monthly sales and student-payment recovery system with five roles: main admin, recovery admin, recovery executive, team leader, and sales executive. Team leaders also have their own sales records. Sales and recovery must share student/enrollment/payment records so updates appear consistently in every authorized dashboard.

Use Next.js for the application and API routes, Supabase Postgres as the database, Prisma for application database access, and Supabase Auth for authentication. The UI calls application APIs for business-data CRUD; those APIs authenticate, authorize, validate, and access Postgres through Prisma. Do not use the Supabase data client, Supabase database functions, or Supabase Edge Functions to fetch or mutate business data. Supabase Auth remains the intentional exception for authentication operations.

Start with CSV imports. Google Sheets link imports are optional future scope, not part of the initial implementation. Use Razorpay payment links and server-side payment reconciliation on dashboard load or explicit refresh, without webhooks. Refresh-based sync is not instantaneous while nobody is checking the dashboard.

The repository currently contains the Next.js 16.4.6 starter with React 19.3.0, TypeScript, and Tailwind. It has no Prisma, Supabase Auth, Razorpay integration, or business features configured.

## 0. Confirm business rules before dependent implementation

- [ ] Review representative sales and recovery CSV files; confirm exact headers, formats, optional columns, and whether imports are per executive, per month, or mixed.
- [ ] Define the distinction between sales month, enrollment/cohort month, and recovery month; a student sold in one month may need recovery in another.
- [ ] Confirm required fields: sale date, student name, college, primary/alternate email and phone, registration amount, total course price, original sales executive, and cohort. Confirm whether domain/course is needed.
- [ ] Confirm whether registration amount means expected registration fee or money actually received; do not infer collected revenue from an ambiguous column.
- [ ] Define how students and enrollments are uniquely matched across imports; allow a student to have multiple enrollments without merging them accidentally.
- [ ] Confirm user provisioning, role changes, multiple-role support, team membership, and whether a team leader can belong to/manage multiple teams.
- [ ] Approve field-level permissions for sales edits, recovery status updates, allocations, discounts, settlement amounts, installment plans, and exports.
- [ ] Clarify “CA” and other ambiguous dictated statuses/terms; confirm whether this means a settlement/category with a manually specified payment amount.
- [ ] Confirm recovery statuses and whether executives may enter free-text statuses or only notes alongside a controlled status list.
- [ ] Define paid, unpaid, partially paid, installment paid, pending balance, settled, and overdue behavior. A paid installment must not incorrectly settle the full enrollment balance.
- [ ] Define who may approve discounts/settlements and how a revised total affects prior payments, remaining balance, and forecast.
- [ ] Define recovery attribution when an assigned executive changes before/after payment, and how historical recoveries appear.
- [ ] Define performance metrics: sales revenue versus collected money; recovery percentage by amount versus lead count; gross versus discounted forecast; daily versus cumulative results.
- [ ] Confirm reporting timezone, currency (expected INR), date boundaries, cohort lifecycle, and any due-date rules.
- [ ] Confirm delete/archive permissions, retention needs, and handling of mistaken payments, refunds, cancellations, or disputed payments.

## 1. Architecture and foundation

- [ ] Read the relevant installed Next.js guides in `node_modules/next/dist/docs/` before implementing routes, authentication boundaries, caching, or UI code.
- [ ] Document the approved role/permission matrix and data flow: UI → Next.js API → authenticated authorization checks → Prisma → Supabase Postgres.
- [ ] Configure environment validation and an example environment file for database connections, Supabase Auth, and Razorpay; keep secrets server-only.
- [ ] Configure Prisma and Supabase-compatible runtime/migration connections, connection pooling, migrations, and isolated development/test environments.
- [ ] Establish shared API conventions for validation, errors, pagination, filtering, sorting, and money/date serialization.
- [ ] Design the responsive dashboard shell, role navigation, month/cohort selectors, forms, tables, and loading/empty/error states.
- [ ] Define authentication-aware caching so private data cannot leak across users and mutations/refreshed payments appear correctly.

## 2. Database design and migrations

- [ ] Model application users linked to Supabase Auth identities, roles, teams, team memberships, and active/inactive access.
- [ ] Model students, contact details, enrollments/sales, original ownership, course prices, registration payments, and cohort/month relationships.
- [ ] Model import batches, source rows, validation outcomes, stable source identifiers, and duplicate-resolution decisions.
- [ ] Model recovery cohorts/batches, assignments, assignment history, statuses, notes, and status history with actor and timestamp.
- [ ] Model financial adjustments, discounts, approved settlements, installment obligations, payment links, payment transactions, and reconciliation runs.
- [ ] Keep contact status, individual link/payment status, and enrollment balance status separate.
- [ ] Use integer minor units for money; add foreign keys, unique constraints, indexes, and transactions for financial and allocation operations.
- [ ] Preserve original source values and audit history when correcting imported values or changing financial terms.
- [ ] Plan database privileges so business tables are not exposed through direct browser Supabase access; verify API authorization even if Prisma bypasses RLS.
- [ ] Create reviewed migrations and non-sensitive seed fixtures covering every role and payment scenario.

## 3. Supabase Auth and role-based access

- [ ] Implement login, logout, session validation/refresh, and admin-managed account creation/password reset using Supabase Auth; no member recovery flow.
- [ ] Resolve identity to server-controlled application roles/team membership; never trust role or owner IDs supplied by the browser.
- [ ] Implement authenticated API authorization helpers and role-aware page access.
- [ ] Main admin: access both sales and recovery, all teams/users, individual records, and approved administrative edits.
- [ ] Recovery admin: manage recovery imports, cohorts, allocations, payment amounts/links, and recovery reporting.
- [ ] Recovery executive: view and work assigned leads, update permitted statuses/notes, and view personal recovery performance.
- [ ] Team leader: manage/view own sales and authorized team sales, member-level performance, and related recovery progress; apply approved edit permissions.
- [ ] Sales executive: manage/view own approved sales records and imports, monthly revenue, payment state, and recovery progress on own enrollments.
- [ ] Implement authorized user/team administration and disable access promptly when users are deactivated.
- [ ] Check row-level and field-level permission enforcement for list, detail, mutation, import, export, and reporting APIs.

## 4. CSV import pipeline

- [ ] Build sales CSV upload with executive/month/cohort context, column mapping, preview, and explicit confirmation before committing rows.
- [ ] Normalize whitespace, dates, phone numbers, emails, currency values, and malformed/missing amounts without silently guessing financial values.
- [ ] Display row-specific errors and corrections; retain enough source context to resolve issues.
- [ ] Implement duplicate detection and explicit skip/update behavior; re-uploading a file must not duplicate enrollments or payments.
- [ ] Preserve ownership and prevent unauthorized imports on behalf of another executive.
- [ ] Build recovery-admin monthly/cohort imports and match existing sales enrollments so recovery does not create disconnected duplicate records.
- [ ] Define unmatched-row review and how to associate recovery imports with the original sales executive.
- [ ] Provide import summaries, downloadable error reports, and import history; support safe retries after failures.
- [ ] Handle realistic file sizes, upload limits, transactional/chunked commits, and resumable processing as needed by actual volume.

## 5. Sales dashboards and CRUD APIs

- [ ] Implement authorized enrollment create/read/update and approved archive/delete behavior through API routes.
- [ ] Build sales-executive monthly lead tables with search, filters, sorting, pagination, and student/enrollment details.
- [ ] Show agreed sales and payment metrics, including registration collected, course value, collected total, remaining balance, and payment state.
- [ ] Add an own-enrollment recovery section showing current assignee, latest contact status/notes, payment progress, and last update.
- [ ] Build team-leader personal sales dashboard plus team overview and individual-member drill-down.
- [ ] Allow authorized team-leader updates to flow into the same recovery records and history.
- [ ] Build main-admin sales overview, team/user drill-down, and approved corrections with audit history.

## 6. Recovery cohorts, allocation, and executive workflow

- [ ] Build recovery-admin month/cohort view with imported leads, forecast, assigned/unassigned counts, and cohort lifecycle controls.
- [ ] Implement range-based allocation against a stable ordered import snapshot with visible row numbering; define inclusive boundaries to avoid gaps/overlaps.
- [ ] Validate ranges and assignees, preview allocations, prevent double assignment, and commit allocation atomically.
- [ ] Support approved reassignment and assignment history; preserve financial attribution under the agreed rules.
- [ ] Build each recovery executive’s assigned-lead table, outstanding amount, unpicked/untouched count, paid/unpaid/partial filters, and progress indicators.
- [ ] Implement statuses such as called, no answer, promised to pay, disconnected, wrong number, and approved custom outcomes/notes.
- [ ] Keep quoted/pitched amounts separate from money actually received; a contact outcome must not create a payment.
- [ ] Record who updated each lead and when; display consistent updates to recovery admins, sales owners, team leaders, and main admin.
- [ ] Protect against concurrent edits/allocations so one user does not silently overwrite another user’s work.

## 7. Razorpay payment links and financial rules

- [ ] Configure Razorpay test credentials first; isolate test/live IDs, secrets, records, and access.
- [ ] Derive an initial proposed remaining amount only from validated course price and actual prior payments; require review for ambiguous rows.
- [ ] Let recovery admin set/override approved per-lead payable amounts and bulk-generate links after amount review.
- [ ] Generate links server-side, map each link to the exact enrollment/obligation, and record amount, purpose, status, and creator.
- [ ] Make generation/retries idempotent and show individual failures during bulk generation.
- [ ] Implement discounts/settlements: validate the change, record approval/history, calculate the revised balance, and issue a replacement link.
- [ ] Define cancellation/expiry behavior for replaced links and safely handle payments received on old links without double counting.
- [ ] Implement approved manually specified quote/category amounts after the “CA” requirement is clarified.
- [ ] Implement installments with separate obligations/links, collected amounts, and remaining enrollment balance. Paying one installment marks that obligation paid while the overall balance remains pending when applicable.
- [ ] Provide copyable payment links for manual sharing; automatic email/WhatsApp sending is outside the initial scope.
- [ ] Handle expiration, cancellation, failure, partial payment policy, overpayment, refunds, and duplicate provider responses according to approved rules.

## 8. Payment reconciliation without webhooks

- [ ] Implement a protected server-side sync API that queries Razorpay for linked payment activity on authorized dashboard load or explicit refresh.
- [ ] Verify provider state and captured/settled payment semantics before recording money received; browser redirects or client-supplied “paid” flags are not proof of payment.
- [ ] Reconcile provider transaction IDs idempotently and update transaction, link, installment, enrollment, and recovery states in a database transaction.
- [ ] Refresh all affected dashboard views and rollups from the shared database after successful reconciliation.
- [ ] Show last checked time, pending sync, and provider errors; retry with bounded concurrency, throttling, and backoff.
- [ ] Scope scans to relevant unresolved/recent links and prevent duplicate concurrent sync runs; establish a reconciliation path for late payments/refunds.
- [ ] Make stale-data behavior explicit: without webhooks or an approved scheduled job, provider changes appear only after a sync runs.

## 9. Recovery reporting and main-admin overview

- [ ] Build recovery-admin totals for forecast, assigned amount/leads, recovered amount, outstanding balance, paid/unpaid/partial counts, and agreed percentage metrics.
- [ ] Build per-executive allocation and recovery performance with date/cohort filters and drill-down.
- [ ] Show daily recovered amounts/percentages and cumulative recovery through each day, using agreed denominators and timezone.
- [ ] Build recovery-executive personal charts and performance summaries; confirm whether any team-wide comparisons are visible to executives.
- [ ] Build main-admin combined sales/recovery overview, active cohort visibility, user/team drill-down, and relevant filters.
- [ ] Ensure metrics handle discounts, installments, reassignment, duplicates, refunds, and empty/zero-denominator cohorts consistently.

## 10. Export

- [ ] Export authorized outstanding/unpaid leads across selected cohorts/executives, including partial-payment leads with a remaining balance.
- [ ] Include approved contact fields, owner/assignee, cohort, latest status, amount outstanding, and current payment link where required for manual outreach.
- [ ] Respect active filters and access scope; exclude fully paid/settled leads under the agreed rules.
- [ ] Escape spreadsheet formula injection, log export actions, and avoid exposing unnecessary personal data.

## 11. Validation, security, and release

- [ ] Verify API authorization for every role, including attempts to access another executive/team’s records or mutate protected financial fields.
- [ ] Test messy CSVs, repeated uploads, matching across sales/recovery imports, invalid ranges, overlapping allocations, and simultaneous edits.
- [ ] Test Razorpay success/failure/retry flows, replacement links, old-link payments, discounts, installments, late payments, and reconciliation idempotency.
- [ ] Validate dashboard/export totals against a small manually calculated fixture, including daily and cumulative recovery.
- [ ] Apply input validation, request/upload limits, rate limits for imports/payment operations, session protection, and secret-safe logging.
- [ ] Check responsive layouts, keyboard access, useful error states, and realistic table/import/report performance.
- [ ] Run appropriate lint, type checks, tests, and production build when implementation is approved; do not start a server unless requested.
- [ ] Document environment setup, migration/deployment steps, initial main-admin provisioning, database backup/restore, and operational recovery procedures.
- [ ] Complete staging acceptance with all five roles, obtain approval for live payment configuration/deployment, and verify production setup.

## Suggested build sequence after approval

1. Confirm business rules and sample CSV formats; approve permission matrix and data model.
2. Set up Prisma/database, Supabase Auth, API conventions, and role enforcement.
3. Implement sales import, shared enrollment records, and sales/team/main-admin sales views.
4. Implement recovery import, cohort forecast, allocation, statuses, and shared recovery visibility.
5. Implement Razorpay amounts/links, discounts, installments, and refresh-based reconciliation.
6. Implement final reports/charts, exports, and combined main-admin overview.
7. Complete end-to-end verification, documentation, and approved deployment.

## Deferred unless separately approved

- Google Sheets URL/service-account imports or continuous sheet synchronization.
- Razorpay webhooks, scheduled background payment polling, or real-time subscriptions.
- Automated email/WhatsApp campaigns or automatic payment-link delivery.
- Additional product features beyond the reviewed scope above.
