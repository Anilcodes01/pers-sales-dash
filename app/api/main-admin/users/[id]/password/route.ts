import { adminContext } from "@/lib/auth/admin-users";
import { readEmployeePassword } from "@/lib/auth/employee-password";
import { apiError, json } from "@/lib/auth/http";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await adminContext();
    const { id } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return json({ error: "Invalid employee." }, 400);
    return json({ password: await readEmployeePassword(id) });
  } catch (error) { return apiError(error); }
}
