import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, apiError } from "@/lib/auth/http";
import { requireRecoveryRole, recoveryExecutives } from "./allocation";
import { cachedRecovery } from "./cache";
import { aggregateStatistics, groupedDaily, summarizeGroups } from "./statistics-aggregate";
export async function recoveryStatistics(request: NextRequest, individual: boolean) {
  try {
    // Authorization is always fresh, including on cache hits. Owner scopes form
    // part of the cache key so one executive can never see another's totals.
    const user = await requireRecoveryRole(individual ? "recovery_executive" : "recovery_admin");
    const month = request.nextUrl.searchParams.get("month");
    const fresh = request.nextUrl.searchParams.get("fresh") === "1";
    const owner = individual ? user.id : null;
    const result = await cachedRecovery(`statistics:${JSON.stringify([owner, month])}`, 25000, async () => {
      const client = db();
      const [monthRows, executives, period] = await Promise.all([
        cachedRecovery(`months:${owner || "admin"}`, 60000, () => client.recoveryLead.findMany({ where: owner ? { assignedTo: owner } : {}, distinct: ["selectedMonth"], select: { selectedMonth: true }, orderBy: { selectedMonth: "asc" } }), fresh),
        individual ? Promise.resolve([]) : recoveryExecutives(fresh),
        individual ? Promise.resolve(null) : client.recoveryPeriod.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true, endedAt: true } }),
      ]);
      const now = new Date();
      const grouped = await aggregateStatistics(client, month, owner, period, now);
      const summary = summarizeGroups(grouped.groups);
      const people = new Map(executives.map(person => [person.id, person]));
      for (const group of grouped.groups) if (group.assignedTo && !people.has(group.assignedTo)) people.set(group.assignedTo, { id: group.assignedTo, name: "Unavailable executive", email: "" });
      const leaders = individual ? [] : [...people.values()].map(person => ({ ...person, ...summarizeGroups(grouped.groups.filter(group => group.assignedTo === person.id)) })).sort((a, b) => b.recoveredPaise - a.recoveredPaise || b.paid - a.paid || a.name.localeCompare(b.name));
      return { summary, leaders, period, daily: period ? groupedDaily(grouped.days, summary.total, grouped.undated, period, now) : { days: [], undated: 0 }, unassigned: summarizeGroups(grouped.groups.filter(group => !group.assignedTo)), months: monthRows.map(row => row.selectedMonth) };
    }, fresh);
    return json(result);
  } catch (error) { return apiError(error); }
}
