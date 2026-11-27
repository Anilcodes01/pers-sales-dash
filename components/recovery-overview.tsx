"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { AllocationSheet, type AllocationStudent } from "./allocation-sheet";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { RecoveryMonthFilter } from "./recovery-month-filter";
import { CURRENT_MONTH, currentRecoveryMonth } from "@/lib/recovery/month";
export function RecoveryOverview() {
  const [month, setMonth] = useState<string | null>(CURRENT_MONTH);
  const [currentMonthName, setCurrentMonthName] = useState("");
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
      setCurrentMonthName(currentRecoveryMonth());
      try {
        const response = await fetch(`/api/recovery-admin/overview${month === null ? "" : `?month=${encodeURIComponent(month === CURRENT_MONTH ? currentRecoveryMonth() : month)}`}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load recovery students.");
        setRecords(data.records); setMonths(data.months); setExecutives(data.executives);
      } catch (error) { if (!controller.signal.aborted) { setFailed(true); toast.error(error instanceof Error ? error.message : "Could not load students."); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [month, revision]);
  return <Card className="csv-records-card recovery-sheet-card recovery-overview-card"><div className="recovery-overview-toolbar"><h2>Recovery students{!loading && !failed ? ` (${records.length})` : ""}</h2><label className="recovery-month-filter"><span className="sr-only">Month</span><RecoveryMonthFilter month={month} months={months} currentMonthName={currentMonthName} onChange={setMonth} disabled={loading}/></label><Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw/> Refresh</Button></div>{loading ? <p>Loading students…</p> : failed ? <p>Unable to load students. Use Refresh to retry.</p> : <>{!records.length ? <p>No recovery students found.</p> : <AllocationSheet rows={records} executives={executives} selected={[]} onSelect={() => {}} disabled executive={false} readOnly/>}</>}</Card>;
}
