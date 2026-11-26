import "server-only";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { requireMainAdmin, AccessError } from "./admin-access";
import { isRole } from "./roles";
import type { User } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export function userSummary(user: User) {
  return { id: user.id, name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "", email: user.email || "", role: isRole(user.app_metadata.role) ? user.app_metadata.role : null, createdAt: user.created_at, lastSignInAt: user.last_sign_in_at || null };
}
export async function adminContext() {
  const actor = await requireMainAdmin();
  if (!adminConfigured()) throw new AccessError(503, "Add the server-only Supabase secret key to enable account administration.");
  return { actor, admin: createAdminClient().auth.admin };
}
export function validateName(value: unknown) {
  if (typeof value !== "string") throw new AccessError(400, "Enter the user’s name.");
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 100) throw new AccessError(400, "Names must contain 1–100 characters.");
  return name;
}
export function validateAccount(body: Record<string, unknown>) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new AccessError(400, "Enter a valid email address.");
  if (!isRole(body.role)) throw new AccessError(400, "Choose a valid role.");
  validatePassword(body.password);
  return { name: validateName(body.name), email, role: body.role, password: body.password as string };
}
export function validatePassword(password: unknown) {
  if (typeof password !== "string" || password.length < 6 || password.length > 128) throw new AccessError(400, "Passwords must contain between 6 and 128 characters.");
}
export async function createAccount(body: Record<string, unknown>) {
  const { actor, admin } = await adminContext();
  const { name, email, role, password } = validateAccount(body);
  const { data, error } = await admin.createUser({ email, password, user_metadata: { full_name: name }, email_confirm: true, app_metadata: { role, created_by: actor.id, credentials_version: randomUUID() } });
  if (error || !data.user) throw new AccessError(error?.status === 422 ? 409 : 400, "Could not create account. Check for an existing email and your Supabase password policy.");
  return userSummary(data.user);
}
export async function updateAccount(id: string, body: Record<string, unknown>) {
  const { actor, admin } = await adminContext();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AccessError(400, "Invalid user ID.");
  const { data: target, error: targetError } = await admin.getUserById(id);
  if (targetError || !target.user) throw new AccessError(404, "Account not found.");
  const hasRole = Object.hasOwn(body, "role");
  const hasPassword = Object.hasOwn(body, "password");
  const hasName = Object.hasOwn(body, "name");
  const name = hasName ? validateName(body.name) : undefined;
  if (!hasRole && !hasPassword && !hasName) throw new AccessError(400, "Provide a name, role, or new password.");
  if (hasRole && !isRole(body.role)) throw new AccessError(400, "Choose a valid role.");
  // Keep existing main admins intact; prevents accidental loss of the final administrator.
  if (hasRole && target.user.app_metadata.role === "main_admin" && body.role !== "main_admin") throw new AccessError(400, "Existing main admins cannot be demoted here.");
  if (hasPassword) validatePassword(body.password);
  const metadata = { ...target.user.app_metadata, ...(hasRole ? { role: body.role } : {}), ...(hasPassword ? { credentials_version: randomUUID(), password_reset_by: actor.id, password_reset_at: new Date().toISOString() } : {}) };
  const { data, error } = await admin.updateUserById(id, { app_metadata: metadata, ...(hasName ? { user_metadata: { ...target.user.user_metadata, full_name: name } } : {}), ...(hasPassword ? { password: body.password as string } : {}) });
  if (error || !data.user) throw new AccessError(400, "Could not update account. Check your Supabase password policy and retry.");
  return userSummary(data.user);
}
