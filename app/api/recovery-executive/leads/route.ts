import { db } from "@/lib/db";
import { json, apiError } from "@/lib/auth/http";
import { requireRecoveryRole } from "@/lib/recovery/allocation";
export async function GET() {
  try {
    const user = await requireRecoveryRole("recovery_executive");
    const client = db(); const where = { assignedTo: user.id };
    const [records, total] = await client.$transaction([
      client.recoveryLead.findMany({ where, orderBy: [{ assignedAt: "desc" }, { id: "asc" }] }),
      client.recoveryLead.count({ where }),
    ]);
    return json({ records, total });
  } catch (error) { return apiError(error); }
}
