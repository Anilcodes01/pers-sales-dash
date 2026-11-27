"use client";
import { useState } from "react";
import { toast } from "sonner";
import { statusColors } from "@/lib/recovery/status-colors";
import { RecoveryStatusBadge } from "./recovery-status-badge";
import { leadStatuses, paymentStatuses } from "@/lib/recovery/statuses";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
export function RecoveryStatusCell({ id, field, value, student, onSaved }: {
  id: string; field: "paymentStatus" | "leadStatus"; value: string; student: string;
  onSaved: (value: string, changes?: { paymentStatus?: string }) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const displayedValue = pending ?? value;
  const options: readonly string[] = field === "paymentStatus" ? paymentStatuses : leadStatuses;
  async function save(next: string) {
    if (saving || next === value) return;
    if (!next.trim() || next.trim().length > 200) { toast.error("Enter a status between 1 and 200 characters."); return; }
    setPending(next);
    setSaving(true);
    try {
      const response = await fetch(`/api/recovery-executive/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: next }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not update status.");
      onSaved(data[field], data); toast.success("Status updated.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update status."); }
    finally { setPending(null); setSaving(false); }
  }
  return <div className="recovery-status-editor"><Select value={displayedValue || undefined} disabled={saving} onValueChange={next => void save(next)}><SelectTrigger aria-label={`${field === "paymentStatus" ? "Payment" : "Lead"} status for ${student || "student"}`} className="recovery-status-trigger" style={statusColors(field, displayedValue)}><SelectValue placeholder="Set status"/></SelectTrigger><SelectContent>{value && !options.includes(value) && <SelectItem value={value}><RecoveryStatusBadge field={field} value={value}/></SelectItem>}{options.map(option => <SelectItem key={option} value={option}><RecoveryStatusBadge field={field} value={option}/></SelectItem>)}</SelectContent></Select>{saving && <span role="status" className="status-saving">Saving…</span>}</div>;
}
