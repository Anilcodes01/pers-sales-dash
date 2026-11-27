"use client";
import { recoveryEditVersion } from "@/lib/recovery/client-edit-version";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SheetFind } from "./sheet-find";
import { useRecoveryLiveRefresh } from "./use-recovery-live-refresh";
import { mergeSheetRows, reconcileSheetRows } from "@/lib/recovery/merge-sheet-rows";
import { Download, RefreshCw } from "lucide-react";
import { AllocationSheet, type AllocationStudent } from "./allocation-sheet";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import { RecoveryMonthFilter } from "./recovery-month-filter";
import { CURRENT_MONTH, currentRecoveryMonth } from "@/lib/recovery/month";
type Results = { months: string[]; records: AllocationStudent[]; total: number; hasMore: boolean; executives: { id: string; name: string; email: string }[] };
export function RecoveredLeads({ individual = false }: { individual?: boolean }) {
  const sheet = useRef<HTMLDivElement>(null);
  const cursor = useRef<string | null>(null);
  const [month, setMonth] = useState<string | null>(CURRENT_MONTH);
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load(): Promise<void> {
      const editVersion = recoveryEditVersion();
      cursor.current = null;
      setLoading(true); setError("");
      try {
        const monthQuery = month === null ? "" : `&month=${encodeURIComponent(month === CURRENT_MONTH ? currentRecoveryMonth() : month)}`;
        const response = await fetch(`/api/${individual ? "recovery-executive" : "recovery-admin"}/recovered-leads?page=${individual ? page : 1}${monthQuery}${revision ? "&fresh=1" : ""}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load recovered leads.");
        if (controller.signal.aborted) return;
        if (recoveryEditVersion() !== editVersion) return await load();
        cursor.current = data.cursor;
        setResults(data);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load recovered leads.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [individual, page, revision, month]);
  const receiveLiveRows = useCallback((data: Record<string, unknown>) => {
    if (Array.isArray(data.records)) setResults(current => {
      const incoming = data as unknown as Results;
      return { ...current, ...incoming, records: individual ? reconcileSheetRows(current?.records || [], incoming.records) : mergeSheetRows(current?.records || [], incoming.records, (data.removedIds || []) as string[], Boolean(data.reset)) };
    });
  }, [individual]);
  const syncStatus = useRecoveryLiveRefresh(`/api/${individual ? "recovery-executive" : "recovery-admin"}/recovered-leads?page=${individual ? page : 1}${month === null ? "" : `&month=${encodeURIComponent(month === CURRENT_MONTH ? currentRecoveryMonth() : month)}`}`, receiveLiveRows, cursor);
  const visibleRows = useMemo(() => (results?.records || []).filter(row => individual || status === "all" || (status === "paid" ? row.paymentStatus.trim().toLowerCase() === "paid" : row.paymentStatus.trim().toLowerCase() !== "paid")), [results?.records, individual, status]);
  const visibleTotal = individual ? results?.total || 0 : visibleRows.length;
  return <Card ref={sheet} className="csv-records-card recovery-sheet-card">
    <SheetFind rows={loading ? [] : visibleRows} root={sheet} source={individual ? { endpoint: `/api/${individual ? "recovery-executive" : "recovery-admin"}/sheet-search?scope=recovered${month === null ? "" : `&month=${encodeURIComponent(month === CURRENT_MONTH ? currentRecoveryMonth() : month)}`}`, onPage: setPage } : undefined}/>
    <div className="panel-heading"><div><h2>{individual ? "Recovered leads" : "Recovery students"}{!loading && !error && results ? ` (${visibleTotal})` : ""}</h2><p className="csv-help">{individual ? "Paid leads currently allocated to you." : "All recovery students, including unassigned students. Unpaid includes everyone not marked paid."}</p></div><div className="recovery-sheet-actions"><RecoveryMonthFilter month={month} months={results?.months || []} onChange={value => { setMonth(value); setPage(1); }} disabled={loading}/>{!individual && <><Select value={status} onValueChange={value => { setStatus(value); setPage(1); }} disabled={loading}><SelectTrigger aria-label="Filter students by payment status"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All students</SelectItem><SelectItem value="paid">Paid students</SelectItem><SelectItem value="unpaid">Unpaid students</SelectItem></SelectContent></Select><Button asChild variant="outline"><a href={`/api/recovery-admin/students/export?status=${status}${month === null ? "&allMonths=1" : `&month=${encodeURIComponent(month === CURRENT_MONTH ? currentRecoveryMonth() : month)}`}`}><Download/>{status === "paid" ? "Export paid CSV" : status === "unpaid" ? "Export unpaid CSV" : "Export all students"}</a></Button></>}<Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw/>Refresh</Button></div></div>
    {syncStatus === "reconnecting" && <p role="status">Reconnecting… displayed data may be out of date.</p>}
    {loading ? <p role="status">Loading recovered leads…</p> : error ? <p role="alert">{error} Use Refresh to retry.</p> : visibleRows.length ? <AllocationSheet searchable={false} rows={visibleRows} executives={results?.executives || []} executive={individual} adminEditable={!individual} onStatusSaved={(id, field, value) => setResults(current => {
      if (!current) return current;
      const remove = individual && field === "paymentStatus" && value !== "paid";
      return { ...current, total: Math.max(0, current.total - (remove ? 1 : 0)), records: remove ? current.records.filter(row => row.id !== id) : current.records.map(row => row.id === id ? { ...row, [field]: value } : row) };
    })} readOnly selected={[]} onSelect={() => {}} disabled offset={individual ? (page - 1) * 25 : 0}/> : <p>{individual ? "No recovered leads allocated to you for this month selection." : "No students match this month and payment filter."}</p>}
    {individual && !loading && !error && results && <div className="pagination"><Button disabled={page === 1} onClick={() => setPage(value => value - 1)}>← Previous</Button><span>Page {page} · {results.total} {individual ? "recovered leads" : "students"}</span><Button disabled={!results.hasMore} onClick={() => setPage(value => value + 1)}>Next →</Button></div>}
  </Card>;
}
