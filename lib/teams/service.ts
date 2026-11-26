import "server-only";
import { db } from "@/lib/db";
import { requireMainAdmin, AccessError } from "@/lib/auth/admin-access";
import { adminContext } from "@/lib/auth/admin-users";

export function teamName(value: unknown) {
  if (typeof value !== "string") throw new AccessError(400, "Enter a team name.");
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 100) throw new AccessError(400, "Team names must contain 1–100 characters.");
  return { name, nameKey: name.toLowerCase() };
}
export function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export async function listTeams() {
  await requireMainAdmin();
  return db().team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, members: { select: { userId: true } } } });
}
export async function createTeam(body: Record<string, unknown>) {
  const actor = await requireMainAdmin();
  const data = teamName(body.name);
  try { return await db().team.create({ data: { ...data, createdBy: actor.id }, select: { id: true, name: true } }); }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new AccessError(409, "A team with that name already exists.");
    throw error;
  }
}
export async function assignTeam(userId: string, body: Record<string, unknown>) {
  const { actor, admin } = await adminContext();
  if (!uuid(userId) || (body.teamId !== null && !uuid(body.teamId))) throw new AccessError(400, "Choose a valid user and team.");
  const { data, error } = await admin.getUserById(userId);
  if (error || !data.user) throw new AccessError(404, "User not found.");
  if (body.teamId === null) {
    await db().teamMembership.deleteMany({ where: { userId } });
    return { userId, teamId: null };
  }
  const teamId = body.teamId as string;
  if (!await db().team.findUnique({ where: { id: teamId }, select: { id: true } })) throw new AccessError(404, "Team not found.");
  return db().teamMembership.upsert({ where: { userId }, create: { userId, teamId, assignedBy: actor.id }, update: { teamId, assignedBy: actor.id }, select: { userId: true, teamId: true } });
}
