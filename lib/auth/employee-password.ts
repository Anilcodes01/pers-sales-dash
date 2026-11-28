import "server-only";
import { db } from "@/lib/db";
import { AccessError } from "./admin-access";

// Call only after an authorized account creation/reset. Verify against Auth so
// concurrent resets cannot leave a stale password saved in the identifier row.
export async function storeEmployeePassword(userId: string, password: string) {
  const count = await db().$executeRaw`
    UPDATE public.employee_identifiers e SET decrypted_password = ${password}
    FROM auth.users u WHERE e.user_id = u.id AND u.id = ${userId}::uuid
    AND u.encrypted_password = extensions.crypt(${password}, u.encrypted_password)
  `;
  if (count !== 1) throw new AccessError(409, "The login was updated, but the password copy could not be saved. Reset the password again to save it.");
}

export async function readEmployeePassword(userId: string) {
  const rows = await db().$queryRaw<{ decrypted_password: string | null }[]>`
    SELECT CASE WHEN u.encrypted_password = extensions.crypt(e.decrypted_password, u.encrypted_password)
      THEN e.decrypted_password ELSE NULL END AS decrypted_password
    FROM public.employee_identifiers e JOIN auth.users u ON e.user_id = u.id
    WHERE e.user_id = ${userId}::uuid
  `;
  return rows[0]?.decrypted_password || null;
}
