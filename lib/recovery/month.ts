export const CURRENT_MONTH = "__current_month__";
export function currentRecoveryMonth(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "Asia/Kolkata" }).format(date);
}
