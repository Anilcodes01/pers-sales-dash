import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, apiError, readAdminBody } from "@/lib/auth/http";
import { requireRecoveryRole } from "@/lib/recovery/allocation";
import { currentRecoveryMonth } from "@/lib/recovery/month";
import { cachedRecovery } from "@/lib/recovery/cache";
export async function GET() {
  try {
    await requireRecoveryRole("recovery_admin");
    const month = currentRecoveryMonth();
    const client = db();
    const [period, recovery] = await Promise.all([
      client.recoveryPeriod.findFirst({ orderBy: { startedAt: "desc" } }),
      cachedRecovery(`navbar-recovery:${month}`, 25000, async () => {
        const [total, paid] = await client.$transaction([
          client.recoveryLead.count({ where: { selectedMonth: month } }),
          client.recoveryLead.count({ where: { selectedMonth: month, paymentStatus: { equals: "paid", mode: "insensitive" } } }),
        ], { isolationLevel: "RepeatableRead" });
        return { month, total, paid, percentage: total ? paid / total * 100 : 0 };
      }),
    ]);
    return json({ period, recovery });
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const user = await requireRecoveryRole("recovery_admin");
    const body = await readAdminBody(request);
    if (body.action === "start") {
      try {
        const period = await db().recoveryPeriod.create({ data: { startedBy: user.id } });
        return json({ period });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "P2002") return json({ error: "Recovery is already active. Refresh to see its status." }, 409);
        throw error;
      }
    }
    if (body.action === "end") {
      const result = await db().recoveryPeriod.updateMany({ where: { endedAt: null }, data: { endedAt: new Date(), endedBy: user.id } });
      if (!result.count) return json({ error: "No active recovery period. Refresh to see its status." }, 409);
      return json({ period: await db().recoveryPeriod.findFirst({ orderBy: { startedAt: "desc" } }) });
    }
    return json({ error: "Choose start or end." }, 400);
  } catch (error) { return apiError(error); }
}
