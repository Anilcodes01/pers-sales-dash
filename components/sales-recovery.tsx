"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { mergeSheetRows } from "@/lib/recovery/merge-sheet-rows";
import { useRecoveryLiveRefresh } from "./use-recovery-live-refresh";
import { AllocationSheet, type AllocationStudent } from "./allocation-sheet";
import { Button } from "./ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import { Card } from "./ui/card";
type Row = AllocationStudent & { createdAt?: string };
export function SalesRecovery({ team: teamView = false }: { team?: boolean }) {
  const pathname = usePathname();
  const team = teamView || pathname === "/team-recovery";
  const baseEndpoint = team ? "/api/team-lead/recovery" : "/api/my-recovery";
  const [employee, setEmployee] = useState("all");
  const [employees, setEmployees] = useState<{ id: string; name: string; employeeId: string | null; roles: string[] }[]>([]);
  const [directoryError, setDirectoryError] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [scope, setScope] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const cursor = useRef<string | null>(null);
  const receive = useCallback((data: Record<string, unknown>) => {
    if (typeof data.scope === "string") setScope(data.scope);
    setRows(current => mergeSheetRows(current, data.records as Row[], data.removedIds as string[], Boolean(data.reset)));
  }, []);
  useEffect(() => {
    if (!team) return;
    const controller = new AbortController();
    setDirectoryLoading(true); setDirectoryError("");
    async function loadEmployees() {
      try {
        const response = await fetch("/api/team-lead/team", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load team employees.");
        if (!controller.signal.aborted) {
          setEmployees(data.employees);
          setEmployee(current => current === "all" || data.employees.some((person: { employeeId: string | null; id: string }) => (person.employeeId || person.id) === current) ? current : "all");
        }
      } catch (err) { if (!controller.signal.aborted) setDirectoryError(err instanceof Error ? err.message : "Unable to load team employees."); }
      finally { if (!controller.signal.aborted) setDirectoryLoading(false); }
    }
    void loadEmployees(); return () => controller.abort();
  }, [team, scope, revision]);
  const visibleRows = team && employee !== "all" ? rows.filter(row => row.executiveId === employee) : rows;
  const sync = useRecoveryLiveRefresh(loading || error ? null : `${baseEndpoint}${scope ? `?scope=${encodeURIComponent(scope)}` : ""}`, receive, cursor);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); cursor.current = null;
    async function load() {
      try {
        const response = await fetch(baseEndpoint, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load recovery leads.");
        if (!controller.signal.aborted) { receive(data); cursor.current = data.cursor; }
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load recovery leads."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [revision, receive, baseEndpoint]);
  return <Card className="csv-records-card recovery-sheet-card"><div className="panel-heading"><div><h2>{team ? "Recovery" : "My recovery"}{!loading && !error ? ` (${visibleRows.length})` : ""}</h2></div><div className="management-actions">{team && <div className="recovery-employee-filter"><span id="recovery-employee-filter-label">Employee</span><Select value={employee} onValueChange={setEmployee} disabled={directoryLoading || Boolean(directoryError)}><SelectTrigger aria-label="Filter recovery by employee" aria-labelledby="recovery-employee-filter-label"><SelectValue placeholder="Select employee"/></SelectTrigger><SelectContent><SelectItem value="all">All team members</SelectItem>{employees.map(person => <SelectItem key={person.id} value={person.employeeId || person.id}>{person.name || person.employeeId || "Employee"}{person.roles.includes("team_leader") ? " (Team lead)" : ""}</SelectItem>)}</SelectContent></Select></div>}<Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw/>Refresh</Button></div></div>{directoryError && <p role="alert">{directoryError} Use Refresh to retry.</p>}{loading ? <p>Loading recovery leads…</p> : error ? <p role="alert">{error}</p> : <>{sync === "reconnecting" && <p role="status">Reconnecting… Use Refresh to retry now.</p>}{visibleRows.length ? <AllocationSheet rows={visibleRows} executives={[]} selected={[]} onSelect={() => {}} disabled={false} executive readOnly/> : <p>{team ? employee === "all" ? "No recovery leads have been assigned to employees in your team yet." : "No recovery leads for this employee yet." : "No recovery leads have been assigned to your Employee ID yet."}</p>}</>}</Card>;
}

export function TeamRecovery() {
  return <SalesRecovery team/>;
}
