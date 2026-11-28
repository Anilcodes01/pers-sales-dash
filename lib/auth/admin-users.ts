import "server-only";
import { storeEmployeePassword } from "./employee-password";
import { invalidateRecoveryCache } from "@/lib/recovery/cache";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { requireMainAdmin, AccessError } from "./admin-access";
import { assignedRoles, hasRole, isRole } from "./roles";
import type { User } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export function userSummary(user: User) {
  return { roles: assignedRoles(user.app_metadata), restricted: user.app_metadata.access_restricted === true || Boolean(user.banned_until && Date.parse(user.banned_until) > Date.now()), id: user.id, name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "", email: user.email || "", role: isRole(user.app_metadata.role) ? user.app_metadata.role : null, createdAt: user.created_at, lastSignInAt: user.last_sign_in_at || null };
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
export function validateRoles(value: unknown) {
  if (!Array.isArray(value) || !value.length || !value.every(isRole) || new Set(value).size !== value.length) throw new AccessError(400, "Choose at least one valid role without duplicates.");
  return value as import("./roles").Role[];
}
export function validateEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new AccessError(400, "Enter a valid email address.");
  return email;
}
export function validateAccount(body: Record<string, unknown>) {
  const email = validateEmail(body.email);
  const accountRoles = Object.hasOwn(body, "roles") ? validateRoles(body.roles) : validateRoles([body.role]);
  validatePassword(body.password);
  return { name: validateName(body.name), email, role: accountRoles[0], roles: accountRoles, password: body.password as string };
}
export function validatePassword(password: unknown) {
  if (typeof password !== "string" || password.length < 6 || password.length > 128) throw new AccessError(400, "Passwords must contain between 6 and 128 characters.");
}
export async function createAccount(body: Record<string, unknown>) {
  const { actor, admin } = await adminContext();
  const { name, email, role, roles, password } = validateAccount(body);
  const { data, error } = await admin.createUser({ email, password, user_metadata: { full_name: name }, email_confirm: true, app_metadata: { role, roles, created_by: actor.id, credentials_version: randomUUID() } });
  if (error || !data.user) throw new AccessError(error?.status === 422 ? 409 : 400, "Could not create account. Check for an existing email and your Supabase password policy.");
  await storeEmployeePassword(data.user.id, password);
  return userSummary(data.user);
}
export async function updateAccount(id: string, body: Record<string, unknown>) {
  const { actor, admin } = await adminContext();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AccessError(400, "Invalid user ID.");
  const { data: target, error: targetError } = await admin.getUserById(id);
  if (targetError || !target.user) throw new AccessError(404, "Account not found.");
  const hasRestriction = Object.hasOwn(body, "restricted");
  if (hasRestriction && typeof body.restricted !== "boolean") throw new AccessError(400, "Choose a valid access status.");
  if (hasRestriction && (id === actor.id || hasRole(target.user.app_metadata, "main_admin"))) throw new AccessError(400, "Main administrator access cannot be restricted here.");
  const hasRoles = Object.hasOwn(body, "roles") || Object.hasOwn(body, "role");
  const nextRoles = hasRoles ? validateRoles(Object.hasOwn(body, "roles") ? body.roles : [body.role]) : assignedRoles(target.user.app_metadata);
  const hasPassword = Object.hasOwn(body, "password");
  const hasEmail = Object.hasOwn(body, "email");
  const email = hasEmail ? validateEmail(body.email) : undefined;
  const emailChanged = hasEmail && email !== target.user.email?.toLowerCase();
  const hasName = Object.hasOwn(body, "name");
  const name = hasName ? validateName(body.name) : undefined;
  if (!hasRoles && !hasPassword && !hasName && !hasRestriction && !hasEmail) throw new AccessError(400, "Provide a name, role, or new password.");
  // Keep existing main admins intact; prevents accidental loss of the final administrator.
  if (hasRoles && hasRole(target.user.app_metadata, "main_admin") && !nextRoles.includes("main_admin")) throw new AccessError(400, "Existing main admins cannot be demoted here.");
  if (hasPassword) validatePassword(body.password);
  const metadata = { ...target.user.app_metadata, ...(emailChanged ? { credentials_version: randomUUID() } : {}), ...(hasRestriction ? { access_restricted: body.restricted, access_changed_by: actor.id, access_changed_at: new Date().toISOString(), credentials_version: randomUUID() } : {}), ...(hasRoles ? { roles: nextRoles, role: nextRoles.includes(target.user.app_metadata.role) ? target.user.app_metadata.role : nextRoles[0] } : {}), ...(hasPassword ? { credentials_version: randomUUID(), password_reset_by: actor.id, password_reset_at: new Date().toISOString() } : {}) };
  const { data, error } = await admin.updateUserById(id, { app_metadata: metadata, ...(emailChanged ? { email, email_confirm: true } : {}), ...(hasRestriction ? { ban_duration: body.restricted ? "876000h" : "none" } : {}), ...(hasName ? { user_metadata: { ...target.user.user_metadata, full_name: name } } : {}), ...(hasPassword ? { password: body.password as string } : {}) });
  if (error || !data.user) throw new AccessError(400, "Could not update account. Check your Supabase password policy and retry.");
  if (hasPassword) await storeEmployeePassword(id, body.password as string);
  if (hasRoles || hasRestriction || hasName) invalidateRecoveryCache("directory:");
  return userSummary(data.user);
}

export async function deleteAccount(id: string) {
  const { actor, admin } = await adminContext();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AccessError(400, "Invalid user ID.");
  const { data, error } = await admin.getUserById(id);
  if (error || !data.user) throw new AccessError(404, "Account not found.");
  if (id === actor.id || hasRole(data.user.app_metadata, "main_admin")) throw new AccessError(400, "Main administrator accounts cannot be deleted here.");
  const { error: deletionError } = await admin.deleteUser(id);
  if (deletionError) throw new AccessError(409, "Employee could not be deleted. Accounts linked to sales or recovery records must be restricted instead to preserve those records.");
  invalidateRecoveryCache("directory:");
  return { deleted: true };
}
