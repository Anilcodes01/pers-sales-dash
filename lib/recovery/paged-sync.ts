import { Prisma, type PrismaClient } from "@prisma/client";
import { sheetSelect } from "./overview-sync";
export async function pagedSnapshot(client: PrismaClient, where: Prisma.RecoveryLeadWhereInput, page: number, cursor: string | null, owner?: string, order: "paidAt" | "createdAt" = "paidAt") {
  return client.$transaction(async tx => {
    const [state] = await tx.$queryRaw<{ latest: bigint; floor: bigint }[]>(Prisma.sql`SELECT coalesce((SELECT max(id) FROM recovery_sheet_changes),0) AS latest,(SELECT floor_id FROM recovery_sync_epoch WHERE singleton=true) AS floor`);
    const since = cursor === null ? null : BigInt(cursor);
    if (since !== null && since >= state.floor && since <= state.latest) {
      const [change] = since === state.latest ? [{ changed: false }] : await tx.$queryRaw<{ changed: boolean }[]>(Prisma.sql`SELECT EXISTS(SELECT 1 FROM recovery_sheet_changes WHERE id>${since} AND id<=${state.latest} ${owner ? Prisma.sql`AND (old_assigned_to=${owner}::uuid OR new_assigned_to=${owner}::uuid)` : Prisma.empty}) AS changed`);
      if (!change.changed) return { cursor: String(state.latest), unchanged: true };
    }
    // Rebuild just this page when membership/order may have changed. This keeps
    // newly paid rows and page boundaries correct; not the full student dataset.
    const [records, total] = await Promise.all([
      tx.recoveryLead.findMany({ where, select: { ...sheetSelect, updatedAt: true }, orderBy: order === "paidAt" ? [{ paidAt: { sort: "desc", nulls: "last" } }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * 25, take: 25 }),
      tx.recoveryLead.count({ where }),
    ]);
    return { cursor: String(state.latest), unchanged: false, records, total, page, hasMore: page * 25 < total };
  }, { isolationLevel: "RepeatableRead", maxWait: 15000, timeout: 15000 });
}
