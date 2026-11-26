import "server-only";
import { currentUser } from "@/lib/auth/session";
import { AccessError } from "@/lib/auth/admin-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/lib/db";
export async function requireRecoveryRole(role: "recovery_admin" | "recovery_executive") {
  const user = await currentUser();
  if (!user) throw new AccessError(401, "Sign in to continue.");
  if (user.app_metadata.role !== role) throw new AccessError(403, "You do not have access to this recovery workspace.");
  return user;
}
export async function recoveryExecutives() {
  const admin = createAdminClient().auth.admin;
  const executives: { id: string; name: string; email: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 1000 });
    if (error) throw new AccessError(502, "Could not load recovery executives.");
    for (const user of data.users) {
      if (user.app_metadata.role === "recovery_executive" && (!user.banned_until || new Date(user.banned_until).getTime() < Date.now())) executives.push({ id: user.id, name: user.user_metadata?.full_name || user.email || "Recovery executive", email: user.email || "" });
    }
    if (data.users.length < 1000) break;
  }
  return executives.sort((a, b) => a.name.localeCompare(b.name));
}
export async function allocateLeads(actorId: string, body: Record<string, unknown>) {
  const { ids, assignedTo, month } = body;
  if (body.reassign !== undefined && typeof body.reassign !== "boolean") throw new AccessError(400, "Invalid reassignment option.");
  const reassign = body.reassign !== false;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!Array.isArray(ids) || !ids.length || !ids.every(id => typeof id === "string" && uuid.test(id)) || new Set(ids).size !== ids.length) throw new AccessError(400, "Select 1 or more students.");
  if (typeof month !== "string" || month.length > 10000) throw new AccessError(400, "Select a month.");
  if (assignedTo !== null) {
    if (typeof assignedTo !== "string" || !uuid.test(assignedTo)) throw new AccessError(400, "Select a recovery executive.");
    const { data, error } = await createAdminClient().auth.admin.getUserById(assignedTo);
    if (error || !data.user || data.user.app_metadata.role !== "recovery_executive" || (data.user.banned_until && new Date(data.user.banned_until).getTime() > Date.now())) throw new AccessError(400, "Choose an active recovery executive.");
  }
  return db().$transaction(async tx => {
    const where = { id: { in: ids as string[] }, selectedMonth: month };
    if (await tx.recoveryLead.count({ where }) !== ids.length) throw new AccessError(409, "Some selected students are no longer in this month. Refresh and try again.");
    const result = await tx.recoveryLead.updateMany({ where: { ...where, ...(!reassign ? { assignedTo: null } : {}) }, data: { assignedTo: assignedTo as string | null, assignedBy: actorId, assignedAt: new Date() } });
    if (reassign && result.count !== ids.length) throw new AccessError(409, "Allocation changed. Refresh and try again.");
    return { updated: result.count, skipped: ids.length - result.count };
  });
}
