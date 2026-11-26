# Recovery leads CSV uploads

Recovery admins open **Recovery leads** in the sidebar, select a CSV, preview its first 20 students, and confirm upload. The downloadable template contains all required headers. Header matching ignores case, spaces, punctuation, and accepts both `Any refferals` and `Any referrals`.

All 14 cell values are stored as text without corrections or required-value checks. Empty cells and repeated students are retained; completely empty rows are ignored. Month comes from `Month selected`. Reuploading a file creates another copy of its students. Files are limited to UTF-8 CSV, 5 MB and 5,000 nonempty rows. Imports commit atomically.

Apply `prisma/migrations/202611260001_recovery_leads/migration.sql` to the application's connected database before using the page, then deploy the regenerated Prisma client (normal npm install generates it). This migration creates `recovery_leads`; it does not change existing sales data. For databases with manually applied migrations, apply this SQL directly rather than replaying all earlier migrations.

The table includes uploader, upload ID, source filename/line, and `created_at` / `updated_at`. Prisma maintains `updated_at` on application updates. Recovery admin authorization is enforced on both listing and upload APIs; direct browser database access is disabled with RLS and revoked anonymous/authenticated grants.

## Allocation

Apply `prisma/migrations/202611260002_recovery_allocation/migration.sql` after the recovery-leads migration, then deploy the regenerated Prisma client. This adds one current assignee, assigning admin, and allocation timestamp to each student.

Recovery admins open **Allocation**, select the exact month value from the uploaded CSV, select students using checkboxes, Select all, or click-and-drag across a range (Shift-click extends it; Ctrl/Cmd-drag adds another range), choose a recovery executive, and save. All students for the selected month load together without pagination. Each numbered student occupies one compact spreadsheet row. Columns use readable widths, with full values wrapping inside cells and horizontal scrolling confined to the sheet. Recovery pages use reduced side padding; the header sidebar toggle collapses navigation to icons for additional space. Existing allocations can be reassigned or cleared by choosing Unassigned. Blank month values appear as Blank month. The original CSV executive-name field remains the sales executive's name; the separate allocation column identifies the recovery executive.

Recovery executives see their own assigned students on their dashboard, including phone, email, plan, amounts, and statuses. Both record queries and counts are restricted server-side to the signed-in assignee. Refresh retrieves new allocations and removes reassigned students from the old executive's list. Only recovery admins can allocate, and only active recovery-executive accounts can be chosen.

## Executive status updates

Assigned executives can change Payment status (unpaid, paid, default) and Lead status directly in their call sheet. Lead options follow the supplied reference. Custom messages are stored separately in the Comments column next to Lead Status, with explicit Save and Cancel. Comments support up to 5,000 characters and may be cleared. Existing imported statuses remain visible until changed. Preset changes save immediately and show a toast; failed saves retain the previous value.

The PATCH endpoint checks the executive role and same-origin request, allows only status and comment fields, and includes the signed-in executive's ID in the database update condition. Reassigned students cannot be updated by their former executive. Every successful change updates `updated_at`. Apply `202611260003_recovery_comments/migration.sql` before using comments. Existing imported lead statuses are retained.

The executive dashboard loads all students assigned to the signed-in executive in one list, without pagination. Row numbering runs continuously across the full list.

## Recovery admin overview

The recovery admin Overview page displays every recovery student as a read-only spreadsheet without pagination. All months is the default; individual filters use the exact `Month selected` values from the uploaded CSV, including a Blank month option. Current allocations and statuses are visible alongside all student fields. Use Refresh to retrieve executives' latest changes.

Status badges share the reference colors across the overview, allocation sheet, upload previews and saved records, and executive status dropdowns. Matching ignores casing and surrounding spaces for display only. Custom/unknown statuses use a neutral purple fallback; imported status text is preserved.

## Recovery leaderboard

The admin overview includes overall recovery metrics and an executive leaderboard ranked by recovered amount, with paid-count and name tie breakers. The existing month filter applies to metrics, rankings, and the student sheet. Each executive's call dashboard includes their own student and status counts, recalculated immediately after status updates. Recovered monetary totals are displayed only on the recovery admin dashboard.

Recovered amount is the full Amount Mentioned by Executive for students whose current payment status is paid, as requested. Registration amounts are not deducted. Common currency prefixes, commas, decimals, and /- suffixes are recognized. Paid rows with unreadable amounts are counted as paid but excluded from monetary totals, with an explicit warning count. This is a current-state summary, not a payment ledger or historical attribution: reassignment moves a student's contribution to their current assignee. Unassigned students remain in overall totals and have a separate breakdown.

All configured lead statuses appear with counts, including zeroes; imported custom statuses and blank statuses are also counted. Counts describe each student's current status, not cumulative call events. The admin table shows key statuses directly and provides expandable full breakdowns for each executive. Existing API authorization restricts executive summaries to their own assigned records.

Recovery percentage is the number of students currently marked paid divided by all students in the current dashboard scope, multiplied by 100. It appears on both dashboards and in each admin leaderboard row, follows the month filter, and shows 0.0% when there are no students. It is a student conversion rate rather than a monetary collection percentage.

Recovery dashboards open their summaries through the navbar Statistics button. Statistics appear in a right-side panel with slide-in/slide-out transitions, Escape/outside-click dismissal, and keyboard focus management. The student sheet stays clear of inline statistics. The admin panel follows the month filter; executive panels retain counts/percentage without recovered monetary totals.

## Allocate by row number

The allocation page also includes an Allocate a row range form: first row, last row, recovery executive, and Reassign already allocated rows. Both row numbers are inclusive and refer to the displayed sheet for the selected month. Invalid, reversed, fractional, or out-of-bounds ranges are rejected. Submitted student IDs preserve the exact displayed range even if new imports change subsequent ordering.

Range allocation skips already assigned students by default, using an `assigned_to IS NULL` condition in the database write. Checking reassignment allows replacement. The success toast reports updated and skipped counts. Existing drag, Shift-click, checkboxes, and Select all remain available; the existing Save allocation action retains its reassignment behavior.

Recovery overview and executive dashboards now default to Current month, calculated in Asia/Kolkata time and matched to the CSV's month-name field. The sheet and Statistics panel share the same month selection; both provide Current month, All months, and individual uploaded month values. If the current month has no records, an empty list/zero statistics are shown rather than falling back to all months. CSV month values have no separate year, so this filter does not infer a year from upload or payment timestamps.

Allocation also opens on the current month (India time), displaying its actual name. Deallocate selected clears assignments for checked/drag-selected students; Deallocate range clears assignments for the inclusive first/last row range without needing an executive selection. Both retain student records, comments, and statuses and use the authorized allocation endpoint with a null assignee. Former assignees lose access through the existing assignment-scoped queries.

## Daily recovery statistics

Apply `prisma/migrations/202611260004_recovery_paid_at/migration.sql` before deploying daily tracking. It adds nullable `paid_at` without inventing dates for old records. An executive marking a student paid records the timestamp; repeat saves of paid preserve it. Comments and lead-status edits do not change it. Changing payment away from paid clears it.

The admin statistics panel groups currently paid students by `paid_at` in India time and shows amounts, counts, and each day's paid count divided by the selected cohort's total students. The month filter selects the CSV cohort, not the calendar month of payment. The chart is a current-state view, so reversals remove entries and reassignment affects current executive attribution. Older/imported paid rows with unknown payment dates are explicitly excluded from the daily chart while remaining in overall totals. It is not a historical transaction ledger.

Animated bars show daily amounts relative to the largest day and daily/overall/executive recovery percentages. Reduced-motion preferences disable bar animations. The month filter is positioned beside the panel close button.

Statistics now load through dedicated authorized summary endpoints, returning aggregates and month choices rather than student records. The panel loads lazily on first opening and caches results per role/month until its Refresh button is used. Refresh invalidates the panel cache and fetches statistics only. The panel month is independent of the sheet month after selection; neither opening, changing its filter, nor refreshing reloads the sheet. A first panel opening uses the sheet's current filter. Executive summary queries are restricted to the signed-in assignee.

Allocation now uses a single range form for both allocation and deallocation; the month filter is next to Refresh. Drag, checkbox, and Select all selection populate the inclusive First row / Last row bounds. Since this form represents one contiguous range, selecting separate rows includes and highlights the intervening rows too. Editing either numeric endpoint updates the sheet highlight. Reloading or changing months clears the endpoints and selection to avoid applying stale row positions.
