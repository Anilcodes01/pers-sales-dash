import { Prisma, type PrismaClient } from "@prisma/client";
import { dailyRecovery, summarizeRecovery, type RecoveryPeriodRange } from "./summary";
export type SummaryGroup = { assignedTo: string | null; payment: string; status: string; total: number; recoveredPaise: number; excludedAmounts: number };
type Day = { date: string; paid: number; recoveredPaise: number; excludedAmounts: number };
export function summarizeGroups(groups: SummaryGroup[]) {
  const result = summarizeRecovery([]);
  for (const group of groups) {
    result.total += group.total;
    if (group.payment === "paid") { result.paid += group.total; result.recoveredPaise += group.recoveredPaise; result.excludedAmounts += group.excludedAmounts; }
    else if (group.payment === "unpaid") result.unpaid += group.total;
    else if (group.payment === "default") result.default += group.total;
    else result.otherPayment += group.total;
    Object.defineProperty(result.statuses, group.status, { value: (Object.hasOwn(result.statuses, group.status) ? result.statuses[group.status] : 0) + group.total, enumerable: true, configurable: true, writable: true });
  }
  result.recoveryPercentage = result.total ? result.paid / result.total * 100 : 0;
  return result;
}
export function groupedDaily(days: Day[], total: number, undated: number, period: RecoveryPeriodRange, now: Date) {
  const calendar = dailyRecovery([], period, now).days;
  const values = new Map(days.map(day => [day.date, day]));
  let cumulativePaid = 0, cumulativePaise = 0;
  return { undated, days: calendar.map(empty => {
    const day = values.get(empty.date) || empty;
    cumulativePaid += day.paid; cumulativePaise += day.recoveredPaise;
    return { ...day, cumulativePaid, cumulativePaise, recoveryPercentage: total ? cumulativePaid / total * 100 : 0 };
  }) };
}
export async function aggregateStatistics(client: PrismaClient, month: string | null, owner: string | null, period: RecoveryPeriodRange | null, now = new Date()) {
  const [result] = await client.$queryRaw<{ groups: SummaryGroup[]; days: Day[]; undated: number }[]>(Prisma.sql`
    WITH cleaned AS (
      SELECT assigned_to,lower(regexp_replace(payment_status,'^\\s+|\\s+$','','g')) AS payment,
      coalesce(nullif(lower(regexp_replace(lead_status,'^\\s+|\\s+$','','g')),''),'No status') AS status,paid_at,
      regexp_replace(replace(regexp_replace(regexp_replace(regexp_replace(amount_mentioned,'^\\s+|\\s+$','','g'),'^(₹|rs\\.?|inr)\\s*','','i'),'\\s*/-$',''),',',''),'^\\s+|\\s+$','','g') AS amount
      FROM recovery_leads WHERE true
      ${owner ? Prisma.sql`AND assigned_to=${owner}::uuid` : Prisma.empty}
      ${month === null ? Prisma.empty : Prisma.sql`AND selected_month=${month}`}
    ), parsed AS (
      SELECT *,CASE WHEN amount ~ '^[0-9]+(\\.[0-9]{1,2})?$' THEN
        CASE WHEN amount::numeric*100<=100000000000 THEN amount::numeric*100 ELSE NULL END ELSE NULL END AS paise FROM cleaned
    ), groups AS (
      SELECT assigned_to AS "assignedTo",payment,status,count(*)::int AS total,
        coalesce(sum(paise) FILTER(WHERE payment='paid'),0) AS "recoveredPaise",
        count(*) FILTER(WHERE payment='paid' AND paise IS NULL)::int AS "excludedAmounts"
      FROM parsed GROUP BY assigned_to,payment,status
    ), days AS (
      SELECT to_char(paid_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS date,count(*)::int AS paid,
      coalesce(sum(paise),0) AS "recoveredPaise",count(*) FILTER(WHERE paise IS NULL)::int AS "excludedAmounts"
      FROM parsed WHERE payment='paid' AND paid_at IS NOT NULL
      AND paid_at>=${period?.startedAt ? new Date(period.startedAt) : null}::timestamptz
      AND paid_at<=${period ? new Date(period.endedAt ?? now) : null}::timestamptz
      GROUP BY 1
    ) SELECT coalesce((SELECT jsonb_agg(g) FROM groups g),'[]'::jsonb) AS groups,
      coalesce((SELECT jsonb_agg(d ORDER BY d.date) FROM days d),'[]'::jsonb) AS days,
      (SELECT count(*)::int FROM parsed WHERE payment='paid' AND paid_at IS NULL) AS undated`);
  return result;
}
