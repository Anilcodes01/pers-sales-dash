"use client";
import { useCallback, useEffect, useState } from "react";
import { useRecoveryLiveRefresh } from "./use-recovery-live-refresh";
import { RefreshCw } from "lucide-react";
import { AllocationSheet, type AllocationStudent } from "./allocation-sheet";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { RecoveryMonthFilter } from "./recovery-month-filter";
import { CURRENT_MONTH, currentRecoveryMonth } from "@/lib/recovery/month";
type Results = { months: string[]; records: AllocationStudent[]; total: number; hasMore: boolean; executives: { id: string; name: string; email: string }[] };
export function RecoveredLeads({ individual = false }: { individual?: boolean }) {
  const [month, setMonth] = useState<string | null>(CURRENT_MONTH);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const monthQuery = month === null ? "" : `&month=${encodeURIComponent(month === CURRENT_MONTH ? currentRecoveryMonth() : month)}`;
        const response = await fetch(`/api/${individual ? "recovery-executive" : "recovery-admin"}/recovered-leads?page=${page}${monthQuery}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load recovered leads.");
        setResults(data);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load recovered leads.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [individual, page, revision, month]);
  const receiveLiveRows = useCallback((data: Record<string, unknown>) => {
    if (Array.isArray(data.records)) setResults(data as unknown as Results);
  }, []);
  useRecoveryLiveRefresh(`/api/${individual ? "recovery-executive" : "recovery-admin"}/recovered-leads?page=${page}${month === null ? "" : `&month=${encodeURIComponent(month === CURRENT_MONTH ? currentRecoveryMonth() : month)}`}`, receiveLiveRows);
  return <Card className="csv-records-card recovery-sheet-card">
    <div className="panel-heading"><div><h2>Recovered leads{!loading && !error && results ? ` (${results.total})` : ""}</h2><p className="csv-help">{individual ? "Paid leads currently allocated to you." : "Paid leads across all recovery executives, including unassigned leads."}</p></div><div className="recovery-sheet-actions"><RecoveryMonthFilter month={month} months={results?.months || []} onChange={value => { setMonth(value); setPage(1); }} disabled={loading}/><Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw/>Refresh</Button></div></div>
    {loading ? <p role="status">Loading recovered leads…</p> : error ? <p role="alert">{error} Use Refresh to retry.</p> : results?.records.length ? <AllocationSheet rows={results.records} executives={results.executives} executive={individual} readOnly selected={[]} onSelect={() => {}} disabled offset={(page - 1) * 25}/> : <p>{individual ? "No recovered leads allocated to you for this month selection." : "No recovered leads for this month selection."}</p>}
    {!loading && !error && results && <div className="pagination"><Button disabled={page === 1} onClick={() => setPage(value => value - 1)}>← Previous</Button><span>Page {page} · {results.total} recovered leads</span><Button disabled={!results.hasMore} onClick={() => setPage(value => value + 1)}>Next →</Button></div>}
  </Card>;
}
