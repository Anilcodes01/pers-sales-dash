# Admin-managed authentication

## Environment

Use `.env` or `.env.local` (never commit real values):

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
SUPABASE_SECRET_KEY=sb_secret_YOUR_KEY
```

Find these under Supabase Project Settings → API / API Keys. A legacy `anon` key can be used for `SUPABASE_PUBLISHABLE_KEY`, and a legacy `service_role` key can be used for `SUPABASE_SECRET_KEY`. The secret is only used by server-side Auth administration; never prefix it with `NEXT_PUBLIC_`. APP_URL is no longer needed because there is no email recovery flow. Do not share actual credentials in chat.

Accounts and trusted role metadata use Supabase Auth’s administration API, not Supabase table queries. Team creation and memberships now use Prisma; see `TEAMS_SETUP.md` for the required database connection values and migration. No plaintext/decrypted password column is created.

## Supabase settings

- Enable email/password login and disable public sign-ups.
- Disable anonymous and unwanted OAuth/phone sign-in providers.
- Set the password minimum to 6 characters, matching the application forms.
- Accounts created here use `email_confirm: true`; no email verification or invitation step is sent. No email templates or recovery redirect URLs are required for this app.
- Turn off password recovery email delivery via your project's supported email configuration if you do not want Supabase to send recovery emails directly. Removing the app page alone does not disable the provider's recovery API.

## First main admin

Once the environment is configured, run this manually in an interactive terminal:

```sh
node --env-file=.env scripts/bootstrap-main-admin.mjs
```

Use `--env-file=.env.local` instead if that is where the values live. The script asks for the email and password (hidden during entry), creates a confirmed main-admin account, and never outputs or stores the password locally. It does not start the application server. If the email already exists, it fails rather than silently taking over or promoting an existing account. Existing accounts can be managed separately through the trusted Supabase administration API.

Sign in at `/login`; each recognized role is sent directly to its dashboard. The main admin can use **Manage users** to open `/users`. `/account` redirects through `/dashboard` for compatibility.

## Admin workflow

- Create an account with an email, role, and initial password. Share these privately with the member; they can sign in immediately.
- List accounts in pages of 20, and select **Manage** to change a role or set a new password.
- Leave the password blank when only changing the role. Enter a password when resetting it; there is no confirmation field.
- Existing main admins cannot be demoted through this screen, preventing accidental loss of the last administrator.
- A password reset rotates a trusted credential version. Protected app pages/APIs compare the current Auth user and verified token version to reject stale credentials; fresh role checks avoid relying on an old JWT role. Supabase manages its own password-reset session behavior. Validate these flows against the configured project before deployment.
- Members have no signup, forgot-password, reset-password, or change-password endpoint in this application. They contact the main admin.
- Passwords are sent only to Supabase Auth over the server-side API, not saved in readable form, returned in API responses, or listed in the account table. The UI allows revealing the newly typed password before submission only.

## API and route structure

- Auth pages remain under `app/(auth)`; the main-admin account screen is under `app/(main-admin)/users`.
- Dashboard URLs: `/admin-dashboard`, `/recovery-dashboard`, `/recovery-executive-dashboard`, `/team-dashboard`, and `/sales-dashboard`. Each checks the current role server-side; a different role is sent to its own dashboard. Missing roles see an assignment-pending message at `/dashboard`. Business metrics remain unimplemented.
- Auth reads begin with `await connection()` inside a Suspense boundary, preventing Supabase’s internal clock reads from running during prerendering.
- `POST /api/auth/login` and `/api/auth/logout` are the only member auth mutations.
- `GET /api/main-admin/users?page=1` lists safe account summaries.
- `POST /api/main-admin/users` creates a confirmed account.
- `PATCH /api/main-admin/users/[id]` updates role and/or password.
- Every administration API verifies the current session and checks the server-controlled `app_metadata.role === main_admin` before constructing the privileged client.
- Admin mutations validate same-origin requests, JSON object bodies, size, roles, identifiers, and password length. Responses are private/no-store.
- Supabase session cookies are HTTP-only, same-site, and secure in production; tokens and service credentials are not returned to frontend code.

Role values: `main_admin`, `recovery_admin`, `recovery_executive`, `team_leader`, `sales_executive`. Editable `user_metadata` never grants access. Role labels alone do not implement access to future business data; subsequent Prisma APIs must use the same session/role checks plus team/ownership scope.

## Provider-wide password restriction: deployment limitation

The application enforces admin-only password management through its own APIs. Supabase's public Auth API separately supports password recovery and authenticated `updateUser({ password })`. Supabase's documented password-verification hook checks sign-in attempts, not password updates; it is not a password-change deny hook. A member who can obtain a Supabase API key and their own provider session outside the app can potentially bypass application-only restrictions. HTTP-only app cookies reduce token exposure but do not prove provider-wide denial.

Do not claim strict provider-wide enforcement until the project's supported Auth/network gateway controls have been configured and tested to block direct member recovery/password-update requests while permitting the server-side admin API. Merely disabling signup, email confirmation, or hiding the recovery UI does not provide that guarantee. No unverified trigger is installed on Supabase-managed auth tables.

References: [Supabase createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [password-based authentication](https://supabase.com/docs/guides/auth/passwords), [available Auth hooks](https://supabase.com/docs/guides/auth/auth-hooks).

## Acceptance and verification

Do not start the server until requested. Once environment setup and server startup are authorized:

1. Bootstrap a main admin and verify login, sign-out, and protected-page access.
2. Create one user for each role; verify no confirmation email is required and their credentials work.
3. Check that signed-out users and all four non-main-admin roles cannot list/create/update accounts, including direct API requests.
4. Verify a member cannot grant themselves main-admin access through user metadata.
5. Change a role and confirm the old role grants no stale API access.
6. Reset a member password, verify old credentials fail, and test existing browser sessions plus fresh login.
7. Check self-reset for the main admin, then sign out and sign in with the new password.
8. Test existing-email failures, invalid input, mismatched passwords, cross-origin writes, and provider outages.
9. Test desktop/mobile layouts and keyboard navigation; verify private responses/cookies.
10. Separately validate the provider-wide restriction above before calling password management fully admin-only across Supabase itself.

Automated route/service checks: `node --test tests/auth.test.mjs`. Lint: `npm run lint`. Production verification in this restricted environment: `npx next build --webpack` (the default Turbopack build needs an internal port that this environment blocks).
