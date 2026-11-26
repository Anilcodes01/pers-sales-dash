"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { AllocationSheet, type AllocationStudent } from "./allocation-sheet";
import { RecoveryStatisticsPanel } from "./recovery-statistics-panel";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
export function RecoveryOverview() {
  const [month, setMonth] = useState<string | null>(null);
  const [months, setMonths] = useState<string[]>([]);
  const [records, setRecords] = useState<AllocationStudent[]>([]);
  const [executives, setExecutives] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setFailed(false);
      try {
        const response = await fetch(`/api/recovery-admin/overview${month === null ? "" : `?month=${encodeURIComponent(month)}`}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load recovery students.");
        setRecords(data.records); setMonths(data.months); setExecutives(data.executives);
      } catch (error) { if (!controller.signal.aborted) { setFailed(true); toast.error(error instanceof Error ? error.message : "Could not load students."); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [month, revision]);
  return <Card className="csv-records-card recovery-sheet-card recovery-overview-card"><RecoveryStatisticsPanel rows={records} executives={executives} loading={loading} failed={failed} scope={month === null ? "All months" : month || "Blank month"}/><div className="recovery-overview-toolbar"><h2>Recovery students{!loading && !failed ? ` (${records.length})` : ""}</h2><label className="recovery-month-filter"><span className="sr-only">Month</span><Select value={month === null ? "all" : String(months.indexOf(month))} disabled={loading} onValueChange={value => setMonth(value === "all" ? null : months[Number(value)])}><SelectTrigger aria-label="Filter by month"><SelectValue placeholder="All months"/></SelectTrigger><SelectContent><SelectItem value="all">All months</SelectItem>{months.map((value, index) => <SelectItem key={value} value={String(index)}>{value || "Blank month"}</SelectItem>)}</SelectContent></Select></label><Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw/> Refresh</Button></div>{loading ? <p>Loading students…</p> : failed ? <p>Unable to load students. Use Refresh to retry.</p> : <>{!records.length ? <p>No recovery students found.</p> : <AllocationSheet rows={records} executives={executives} selected={[]} onSelect={() => {}} disabled executive={false} readOnly/>}</>}</Card>;
}
