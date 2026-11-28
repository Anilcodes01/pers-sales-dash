import { currentRecoveryMonth } from "./month";
export const earlyRecoveryStatuses = ["disconnected", "talk to executive", "sold for 1000", "MPKD"];
export function salesRecoveryVisibility(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date);
  const value = (type: string) => Number(parts.find(part => part.type === type)!.value);
  const day = value("day");
  const batch = new Date(Date.UTC(value("year"), value("month") - 1 + (day >= 25 ? 1 : 0), 1));
  const restricted = day <= 5 || day >= 25;
  return { month: currentRecoveryMonth(date), statuses: restricted ? earlyRecoveryStatuses : null, scope: `${batch.toISOString().slice(0, 7)}:${restricted ? "early" : "all"}` };
}
