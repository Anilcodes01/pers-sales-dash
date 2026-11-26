import "server-only";
import { adminContext, userSummary } from "@/lib/auth/admin-users";
import { AccessError } from "@/lib/auth/admin-access";
import { db } from "@/lib/db";
import { uuid } from "@/lib/teams/service";
import { reportingMonth } from "./csv";
import type { Prisma } from "@prisma/client";

export async function adminSalesOptions() {
  const { admin } = await adminContext();
  const people = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.listUsers({ page, perPage: 1000 });
    if (error) throw new AccessError(502, "Could not load salesperson filters.");
    people.push(...data.users.map(userSummary));
    if (!data.nextPage) break;
    page = data.nextPage;
  }
  const [teams, periods, owners] = await db().$transaction([
    db().team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, members: { select: { userId: true } } } }),
    db().salesRecord.findMany({ distinct: ["reportingMonth"], orderBy: { reportingMonth: "desc" }, select: { reportingMonth: true } }),
    db().salesRecord.findMany({ distinct: ["ownerId"], select: { ownerId: true } }),
  ]);
  const ownerIds = new Set(owners.map(row => row.ownerId));
  return { teams, months: periods.map(row => row.reportingMonth.toISOString().slice(0, 7)), people: people.filter(person => person.role === "sales_executive" || person.role === "team_leader" || ownerIds.has(person.id)).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)) };
}
export async function adminSales(params: URLSearchParams) {
  const { admin } = await adminContext();
  const teamId = params.get("teamId");
  const ownerId = params.get("ownerId");
  const month = params.get("month");
  const page = Number(params.get("page") || 1);
  if (!Number.isInteger(page) || page < 1 || page > 100000) throw new AccessError(400, "Invalid page.");
  if (teamId && teamId !== "unassigned" && !uuid(teamId)) throw new AccessError(400, "Choose a valid team.");
  if (ownerId && !uuid(ownerId)) throw new AccessError(400, "Choose a valid salesperson.");
  const where: Prisma.SalesRecordWhereInput = {};
  if (month) {
    try { where.reportingMonth = reportingMonth(month); } catch (error) { throw new AccessError(400, (error as Error).message); }
  }
  if (teamId) {
    const memberships = await db().teamMembership.findMany({ where: teamId === "unassigned" ? {} : { teamId }, select: { userId: true } });
    const ids = memberships.map(member => member.userId);
    where.ownerId = teamId === "unassigned" ? { notIn: ids } : { in: ids };
    if (ownerId) where.AND = [{ ownerId }];
  } else if (ownerId) where.ownerId = ownerId;
  const [records, total] = await db().$transaction([
    db().salesRecord.findMany({ where, orderBy: [{ reportingMonth: "desc" }, { createdAt: "desc" }, { id: "asc" }], take: 25, skip: (page - 1) * 25, select: { id: true, ownerId: true, reportingMonth: true, dateFromCsv: true, name: true, college: true, emailId: true, phone: true, whatsapp: true, programPlan: true, totalAmountPaise: true, registrationAmountPaise: true, comments: true, rawValues: true, createdAt: true, updatedAt: true } }),
    db().salesRecord.count({ where }),
  ]);
  const ids = [...new Set(records.map(row => row.ownerId))];
  const memberships = ids.length ? await db().teamMembership.findMany({ where: { userId: { in: ids } }, select: { userId: true, team: { select: { id: true, name: true } } } }) : [];
  const profiles = await Promise.all(ids.map(async id => {
    const { data, error } = await admin.getUserById(id);
    if (error || !data.user) throw new AccessError(502, "Could not load sales owner details. Please retry.");
    return userSummary(data.user);
  }));
  return { records: records.map(row => ({ ...row, owner: profiles.find(profile => profile.id === row.ownerId), team: memberships.find(member => member.userId === row.ownerId)?.team || null })), total, page, hasMore: page * 25 < total };
}
