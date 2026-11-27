export const CURRENT_MONTH = "__current_month__";
// Recovery batches roll over at midnight in India on the 25th.
export function currentRecoveryMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Kolkata" }).formatToParts(date);
  const value = (type: string) => Number(parts.find(part => part.type === type)!.value);
  const month = value("month") - 1 + (value("day") >= 25 ? 1 : 0);
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(value("year"), month, 1)));
}
