import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { createAuthClient } from "@/lib/supabase/server";
import { authConfigured } from "@/lib/supabase/config";
import { AccessError } from "./admin-access";
import { validateAccount } from "./admin-users";
import { storeEmployeePassword } from "./employee-password";
import { dashboardPath } from "./dashboard-routing";

export async function registrationLimit(identity: string, limit: number) {
  const key = createHash("sha256").update(identity).digest("hex");
  const rows = await db().$queryRaw<{ attempts: number }[]>`
    INSERT INTO public.registration_rate_limits(key, attempts, expires_at)
    VALUES (${key}, 1, now() + interval '15 minutes')
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN registration_rate_limits.expires_at <= now() THEN 1 ELSE registration_rate_limits.attempts + 1 END,
      expires_at = CASE WHEN registration_rate_limits.expires_at <= now() THEN now() + interval '15 minutes' ELSE registration_rate_limits.expires_at END
    RETURNING attempts
  `;
  if (rows[0].attempts > limit) throw new AccessError(429, "Too many registration attempts. Please try again in 15 minutes.");
}
export async function registerTeamMember(kind: string, body: Record<string, unknown>, address: string) {
  if (kind !== "team-lead" && kind !== "employee") throw new AccessError(404, "Registration page not found.");
  if (!adminConfigured() || !authConfigured()) throw new AccessError(503, "Registration is not configured yet.");
  const role = kind === "team-lead" ? "team_leader" : "sales_executive";
  // Never accept role or roles from a public registration request.
  const { name, email, password } = validateAccount({ name: body.name, email: body.email, password: body.password, role });
  if (typeof body.teamId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.teamId)) throw new AccessError(400, "Choose a valid team.");
  await registrationLimit(`ip:${address}`, 100);
  await registrationLimit(`email:${email}`, 5);
  const team = await db().team.findUnique({ where: { id: body.teamId }, select: { id: true } });
  if (!team) throw new AccessError(404, "This team no longer exists. Ask your team lead for a new link.");
  const admin = createAdminClient().auth.admin;
  const { data, error } = await admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name }, app_metadata: { role, roles: [role], credentials_version: randomUUID(), registration_source: kind } });
  if (error || !data.user) throw new AccessError(error?.status === 422 ? 409 : 400, "Could not register. Your email may already have an account. Try signing in or contact your administrator.");
  try {
    await db().teamMembership.create({ data: { userId: data.user.id, teamId: team.id } });
    await storeEmployeePassword(data.user.id, password);
  } catch {
    // No orphan account if membership/password storage cannot be completed.
    const { error: cleanupError } = await admin.deleteUser(data.user.id);
    if (cleanupError) throw new AccessError(503, "Your account was created, but team setup failed. Contact your administrator before trying again.");
    throw new AccessError(503, "Team setup could not complete. Please try registering again.");
  }
  try {
    const client = await createAuthClient();
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    return { redirect: signInError ? "/login" : dashboardPath(role), registered: true };
  } catch { return { redirect: "/login", registered: true }; }
}
