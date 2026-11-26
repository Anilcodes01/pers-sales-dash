"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Loader2 } from "lucide-react";
import { AllocationSheet, type AllocationStudent } from "./allocation-sheet";
import { Button } from "./ui/button";
import { RecoveryStatisticsPanel } from "./recovery-statistics-panel";
import { Card } from "./ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";

type Student = AllocationStudent;
type Executive = { id: string; name: string; email: string };
export function RecoveryAllocation({ executive = false }: { executive?: boolean }) {
  const [months, setMonths] = useState<string[]>([]);
  const [executives, setExecutives] = useState<Executive[]>([]);
  const [month, setMonth] = useState<string | null>(null);
  const [assignee, setAssignee] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [records, setRecords] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (executive) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/recovery-admin/allocation/options", { cache: "no-store", signal: controller.signal });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load allocation options.");
        setMonths(data.months); setExecutives(data.executives);
      } catch (error) { if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : "Could not load options."); }
    }
    void load(); return () => controller.abort();
  }, [executive, revision]);
  useEffect(() => {
    if (!executive && month === null) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setFailed(false);
      try {
        const endpoint = executive ? "/api/recovery-executive/leads" : `/api/recovery-admin/allocation?month=${encodeURIComponent(month!)}`;
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load students.");
        setRecords(data.records); setTotal(data.total); setSelected([]);
      } catch (error) { if (!controller.signal.aborted) { setFailed(true); toast.error(error instanceof Error ? error.message : "Could not load students."); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [executive, month, revision]);
  async function allocate() {
    setBusy(true);
    try {
      const response = await fetch("/api/recovery-admin/allocation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selected, assignedTo: assignee === "unassigned" ? null : assignee, month }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Allocation failed.");
      toast.success(`${data.updated} students ${assignee === "unassigned" ? "unassigned" : "allocated"}.`); setSelected([]); setRevision(value => value + 1);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Allocation failed."); }
    finally { setBusy(false); }
  }
  return <Card className="csv-records-card recovery-sheet-card">{executive && <RecoveryStatisticsPanel rows={records} individual loading={loading} failed={failed}/>}<div className="panel-heading"><h2>{executive ? "Students to call" : "Student allocation"}</h2><Button variant="outline" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}><RefreshCw/> Refresh</Button></div>{!executive && <><div className="auth-form csv-upload-form"><label>Month from CSV<Select value={month === null ? "" : String(months.indexOf(month))} disabled={busy || loading} onValueChange={value => { setMonth(months[Number(value)]); setSelected([]); setRecords([]); }}><SelectTrigger><SelectValue placeholder="Select month"/></SelectTrigger><SelectContent>{months.map((value, index) => <SelectItem key={value} value={String(index)}>{value || "Blank month"}</SelectItem>)}</SelectContent></Select></label><label>Allocate to<Select value={assignee} disabled={busy} onValueChange={setAssignee}><SelectTrigger><SelectValue placeholder="Select recovery executive"/></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{executives.map(person => <SelectItem key={person.id} value={person.id}>{person.name} ({person.email})</SelectItem>)}</SelectContent></Select></label><Button disabled={busy || loading || failed || !selected.length || !assignee} onClick={() => void allocate()}>{busy && <Loader2 className="animate-spin"/>} Save allocation ({selected.length})</Button></div><p className="csv-help">Click and drag across rows to select a range. Shift-click extends the range; Ctrl/Cmd-drag adds another range. Checkboxes and Select all also work. Scroll the sheet sideways to see remaining columns. Saving replaces the selected students’ current allocation.</p></>}{!executive && month === null ? <p>Select a month to view students.</p> : loading ? <p>Loading students…</p> : failed ? <p>Could not load students. Use Refresh to retry.</p> : <><p className="csv-help">{total} students{executive ? " assigned to you" : " in this month"}.</p>{records.length ? <AllocationSheet rows={records} executives={executives} selected={selected} onSelect={setSelected} disabled={busy} executive={executive} onStatusSaved={(id, field, value) => setRecords(current => current.map(row => row.id === id ? { ...row, [field]: value } : row))}/> : <p>{executive ? "No students allocated to you yet." : "No students found for this month."}</p>}</>}</Card>;
}
