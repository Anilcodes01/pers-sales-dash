import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import type { User } from "@supabase/supabase-js";
import { adminContext, createAccount, userSummary } from "@/lib/auth/admin-users";
import { json, apiError, readAdminBody } from "@/lib/auth/http";
export async function GET() {
  try {
    const { admin } = await adminContext();
    const users: User[] = [];
    for (let page = 1; ; page++) {
      const { data, error } = await admin.listUsers({ page, perPage: 1000 });
      if (error) return json({ error: "Unable to load users." }, 502);
      users.push(...data.users);
      if (!data.nextPage) break;
    }
    const identifiers = await db().employeeIdentifier.findMany({ where: { userId: { in: users.map(user => user.id) } }, select: { userId: true, employeeId: true, decryptedPassword: true } });
    const employeeIds = new Map(identifiers.map(item => [item.userId, item]));
    return json({ users: users.map(user => ({ ...userSummary(user), employeeId: employeeIds.get(user.id)?.employeeId || null, savedPassword: employeeIds.get(user.id)?.decryptedPassword ?? null })) });
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try { return json({ user: await createAccount(await readAdminBody(request)) }, 201); }
  catch (error) { return apiError(error); }
}
