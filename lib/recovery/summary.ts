import { leadStatuses } from "./statuses";
export type RecoverySummaryRow = { assignedTo: string | null; amountMentioned: string; paymentStatus: string; leadStatus: string; paidAt?: string | Date | null };
export function amountInPaise(value: string): number | null {
  const cleaned = value.trim().replace(/^(?:₹|rs\.?|inr)\s*/i, "").replace(/\s*\/-$/, "").replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise <= 100_000_000_000 ? paise : null;
}
export function summarizeRecovery(rows: RecoverySummaryRow[]) {
  const statuses: Record<string, number> = Object.fromEntries(leadStatuses.map(status => [status.toLowerCase(), 0]));
  const result = { total: rows.length, recoveredPaise: 0, paid: 0, unpaid: 0, default: 0, otherPayment: 0, excludedAmounts: 0, statuses };
  for (const row of rows) {
    const payment = row.paymentStatus.trim().toLowerCase();
    if (payment === "paid") {
      result.paid++;
      const amount = amountInPaise(row.amountMentioned);
      if (amount === null) result.excludedAmounts++; else result.recoveredPaise += amount;
    } else if (payment === "unpaid") result.unpaid++;
    else if (payment === "default") result.default++;
    else result.otherPayment++;
    const status = row.leadStatus.trim().toLowerCase() || "No status";
    // Use own properties so arbitrary imported status text is safe as a key.
    Object.defineProperty(statuses, status, { value: (Object.hasOwn(statuses, status) ? statuses[status] : 0) + 1, enumerable: true, configurable: true, writable: true });
  }
  return { ...result, recoveryPercentage: result.total ? result.paid / result.total * 100 : 0 };
}
export function recoveryLeaderboard(rows: RecoverySummaryRow[], executives: { id: string; name: string; email: string }[]) {
  const people = new Map(executives.map(person => [person.id, person]));
  const groups = new Map<string, RecoverySummaryRow[]>();
  for (const row of rows) {
    if (!row.assignedTo) continue;
    if (!people.has(row.assignedTo)) people.set(row.assignedTo, { id: row.assignedTo, name: "Unavailable executive", email: "" });
    const group = groups.get(row.assignedTo) || []; group.push(row); groups.set(row.assignedTo, group);
  }
  return [...people.values()].map(person => ({ ...person, ...summarizeRecovery(groups.get(person.id) || []) })).sort((a, b) => b.recoveredPaise - a.recoveredPaise || b.paid - a.paid || a.name.localeCompare(b.name));
}

export function dailyRecovery(rows: RecoverySummaryRow[]) {
  const days = new Map<string, { date: string; paid: number; recoveredPaise: number; excludedAmounts: number; recoveryPercentage: number }>();
  let undated = 0;
  for (const row of rows) {
    if (row.paymentStatus.trim().toLowerCase() !== "paid") continue;
    const timestamp = row.paidAt ? new Date(row.paidAt) : null;
    if (!timestamp || Number.isNaN(timestamp.getTime())) { undated++; continue; }
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(timestamp);
    const day = days.get(date) || { date, paid: 0, recoveredPaise: 0, excludedAmounts: 0, recoveryPercentage: 0 };
    day.paid++;
    const amount = amountInPaise(row.amountMentioned);
    if (amount === null) day.excludedAmounts++; else day.recoveredPaise += amount;
    day.recoveryPercentage = rows.length ? day.paid / rows.length * 100 : 0;
    days.set(date, day);
  }
  return { days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), undated };
}
