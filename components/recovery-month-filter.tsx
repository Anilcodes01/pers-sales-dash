"use client";
import { CURRENT_MONTH, currentRecoveryMonth } from "@/lib/recovery/month";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
export function RecoveryMonthFilter({ month, months, onChange, disabled = false, allowAll = true, currentMonthName = "", label = "Filter by month" }: { month: string | null; months: string[]; onChange: (month: string | null) => void; disabled?: boolean; allowAll?: boolean; currentMonthName?: string; label?: string }) {
  currentMonthName = currentMonthName || currentRecoveryMonth();
  return <Select value={month === CURRENT_MONTH || month === currentMonthName ? "current" : month === null ? "all" : `month-${months.indexOf(month)}`} disabled={disabled} onValueChange={value => onChange(value === "current" ? CURRENT_MONTH : value === "all" ? null : months[Number(value.slice(6))])}><SelectTrigger aria-label={label}><SelectValue placeholder="Select month"/></SelectTrigger><SelectContent className="recovery-month-options" position="popper"><SelectItem value="current">{currentMonthName || "Select month"}</SelectItem>{allowAll && <SelectItem value="all">All months</SelectItem>}{months.map((value, index) => value === currentMonthName ? null : <SelectItem key={value} value={`month-${index}`}>{value || "Blank month"}</SelectItem>)}</SelectContent></Select>;
}
