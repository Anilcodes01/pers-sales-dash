# Monthly sales CSV import

Sales executives use `/sales-imports`; team leaders use `/team-imports`. Both pages appear as **My sales** in their sidebar. These imports belong to the signed-in user, including a team leader's own sales; they do not import on behalf of team members.

## Database setup

Run the new migration after reviewing `prisma/migrations/202611250003_preserve_csv_values/migration.sql`:

```sh
npm run db:generate
npm run db:migrate
```

Alternatively, execute that SQL file in Supabase SQL Editor, then record it with:

```sh
npx prisma migrate resolve --applied 202611250003_preserve_csv_values
```

Use either migration deploy or manual SQL application, not both. No live migration is applied by the implementation task. Existing team tables/users are unchanged.

The migration adds `public.sales_imports` and `public.sales_records`. Every record has `created_at` and `updated_at`; Prisma maintains `updated_at` when future application edits are made. Dates from the CSV are stored in `date_from_csv`, separately from the selected `reporting_month`. Owner IDs come exclusively from the authenticated session. RLS is enabled and direct browser privileges are revoked. Auth-user foreign keys are maintained in migration SQL; do not overwrite the database with `prisma db push`.

## File format

UTF-8 CSV, up to 5 MB and 5,000 nonempty rows. Download the template on the page. Required headers support the screenshot format:

| CSV header | Stored field |
| --- | --- |
| DATE / datefromcsv | date_from_csv |
| NAME | name |
| COLLEGE | college |
| EMAIL ID | email_id |
| PHONE NO. / phone | phone |
| WHATSAPP NO. / whatsapp | whatsapp |
| PROGRAM PLAN | program_plan |
| AMOUNT / total amount | total_amount |
| PRE REG / registration amount | registration_amount |
| COMMENTS | comments |

Header matching ignores capitalization, spaces, and punctuation. Expected column headers must appear exactly once so values can be mapped. Entirely blank rows are ignored. All data rows are accepted without field corrections: blank names, missing colleges/plans, arbitrary emails/phone numbers, and unusual dates/amounts are retained.

Original cells, including casing and whitespace, are stored in `raw_values` and shown in preview/listing. Text columns use Postgres `text`. Parsed dates and integer paise amounts are optional helper columns: if a value cannot be parsed, its helper is null and the original string is preserved. Registration amount may exceed total amount without blocking import. Imported amounts do not constitute verified payment transactions.

The selected month/year remains a separate reporting period and must be valid. Source dates are preserved regardless of that selection. The API still checks authentication, expected headers, readable CSV structure, and resource limits; these are not data-correction requirements.

## Import flow

1. Select month and year, then choose a CSV.
2. **Preview CSV** reads the file without database writes and shows the first 20 rows.
3. **Confirm import** stores all nonempty rows in one transaction; no row-correction step is required.
4. Repeated identical rows within the file are retained using occurrence identities. Re-uploading the same content for the same owner/month skips previously saved copies. Existing ordinary rows retain compatible identities where possible. Different owners/months remain independent.
5. A modified row is new content, not an update to an earlier import; importing corrected/reformatted copies can create additional records.
6. The monthly table shows only the current user's records, 25 per page, with creation/update timestamps in UTC.

The uploaded file itself is not persisted or exposed as a public file; its mapped cell values are retained in the database. API routes under `/api/sales-executives/imports` and `/api/team-lead/imports` authenticate, authorize, validate, and use Prisma. Multipart request size is bounded on the server, independently of browser checks. Other roles cannot read or upload through these endpoints. No Supabase data client, database function, or Edge Function is used.

Verify after migration: upload a representative file under each permitted role, check row values and month ownership, retry to verify duplicate skipping, test blank and unusual values for faithful preservation, and verify another user's records are inaccessible. The server is not started automatically.

## Main-admin sales overview

The main admin's **Sales** sidebar item opens `/sales`. `GET /api/main-admin/sales` lists all owners' imported records with owner details, current team, reporting month, source values, and timestamps. Optional filters are `teamId` (UUID or `unassigned`), `ownerId` (UUID), and `month` (`YYYY-MM`), combined with AND semantics. Omitted filters include all records; pagination is 25 rows per page. Sales executives and team leaders are both included.

`GET /api/main-admin/sales/options` supplies team, salesperson, and recorded-month dropdown choices. Auth profiles/roles come from the server-side Supabase Auth admin API; business records and memberships come through Prisma. Both endpoints validate main-admin access before reading data.

Team filtering reflects current team membership, not a snapshot at sale time. Reassigning a user changes where their existing sales appear in team filters. No additional database migration is required for this overview.
