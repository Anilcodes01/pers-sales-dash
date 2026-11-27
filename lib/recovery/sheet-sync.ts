import { Prisma, type PrismaClient } from "@prisma/client";
import { sheetSelect } from "./overview-sync";
export async function sheetSnapshot(client: PrismaClient, month: string | null, cursor: string | null, assignedTo?: string) {
  if (cursor !== null && !/^\d{1,19}$/.test(cursor)) throw new Error("INVALID_CURSOR");
  return client.$transaction(async tx => {
    const [state] = await tx.$queryRaw<{ latest: bigint; floor: bigint }[]>(Prisma.sql`
      SELECT coalesce((SELECT max(id) FROM recovery_sheet_changes),0) AS latest,
      (SELECT floor_id FROM recovery_sync_epoch WHERE singleton=true) AS floor`);
    const since = cursor === null ? null : BigInt(cursor);
    const where = { ...(month === null ? {} : { selectedMonth: month }), ...(assignedTo ? { assignedTo } : {}) };
    if (since === null || since < state.floor || since > state.latest) {
      const records = await tx.recoveryLead.findMany({ where, select: { ...sheetSelect, assignedAt: true }, orderBy: assignedTo ? [{ assignedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "asc" }] });
      return { cursor: String(state.latest), records, removedIds: [], reset: true, unchanged: false };
    }
    if (since === state.latest) return { cursor: String(state.latest), records: [], removedIds: [], reset: false, unchanged: true };
    // Scope log reads by BOTH previous and current ownership, so reassigned and
    // deleted students disappear without exposing unrelated students' IDs.
    const changes = await tx.$queryRaw<{ id: bigint; leadId: string; oldMonth: string | null; newMonth: string | null; owner: string | null; patch: Record<string, unknown> | null }[]>(Prisma.sql`
      SELECT id,lead_id AS "leadId",old_month AS "oldMonth",new_month AS "newMonth",new_assigned_to AS owner,patch
      FROM recovery_sheet_changes WHERE id>${since} AND id<=${state.latest}
      ${assignedTo ? Prisma.sql`AND (old_assigned_to=${assignedTo}::uuid OR new_assigned_to=${assignedTo}::uuid)` : Prisma.empty}
      ${month === null ? Prisma.empty : Prisma.sql`AND (old_month=${month} OR new_month=${month})`}
      ORDER BY id ASC LIMIT 2001`);
    if (changes.length > 2000) {
      const records = await tx.recoveryLead.findMany({ where, select: { ...sheetSelect, assignedAt: true }, orderBy: assignedTo ? [{ assignedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "asc" }] });
      return { cursor: String(state.latest), records, removedIds: [], reset: true, unchanged: false };
    }
    const patches = new Map<string, Record<string, unknown>>();
    const removed = new Set<string>();
    for (const change of changes) {
      if (!change.patch || (assignedTo && change.owner !== assignedTo) || (month !== null && change.newMonth !== month)) {
        patches.delete(change.leadId); removed.add(change.leadId);
      } else {
        patches.set(change.leadId, { ...patches.get(change.leadId), ...change.patch }); removed.delete(change.leadId);
      }
    }
    return { cursor: String(state.latest), records: [...patches.values()], removedIds: [...removed], reset: false, unchanged: !changes.length };
  }, { isolationLevel: "RepeatableRead", maxWait: 15000, timeout: 15000 });
}
