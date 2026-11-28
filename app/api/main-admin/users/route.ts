import { db } from "@/lib/db";
import type { NextRequest } from "next/server";
import { adminContext, createAccount, userSummary } from "@/lib/auth/admin-users";
import { json, apiError, readAdminBody } from "@/lib/auth/http";
export async function GET(request: NextRequest) {
  try {
    const { admin } = await adminContext();
    const page = Number(request.nextUrl.searchParams.get("page") || "1");
    if (!Number.isInteger(page) || page < 1 || page > 100000) return json({ error: "Invalid page." }, 400);
    const { data, error } = await admin.listUsers({ page, perPage: 20 });
    if (error) return json({ error: "Unable to load users." }, 502);
    const identifiers = await db().employeeIdentifier.findMany({ where: { userId: { in: data.users.map(user => user.id) } } });
    const employeeIds = new Map(identifiers.map(item => [item.userId, item.employeeId]));
    return json({ users: data.users.map(user => ({ ...userSummary(user), employeeId: employeeIds.get(user.id) || null })), page, hasMore: Boolean(data.nextPage) });
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try { return json({ user: await createAccount(await readAdminBody(request)) }, 201); }
  catch (error) { return apiError(error); }
}
