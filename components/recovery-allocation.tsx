"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Loader2 } from "lucide-react";
import { AllocationSheet, type AllocationStudent } from "./allocation-sheet";
import { RecoveryMonthFilter } from "./recovery-month-filter";
import { CURRENT_MONTH, currentRecoveryMonth } from "@/lib/recovery/month";
import { numberedRowRange } from "@/lib/recovery/selection";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { RecoveryStatisticsPanel } from "./recovery-statistics-panel";
import { Card } from "./ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select";

type Student = AllocationStudent;
type Executive = { id: string; name: string; email: string };
export function RecoveryAllocation({
  executive = false,
}: {
  executive?: boolean;
}) {
  const [executiveMonth, setExecutiveMonth] = useState<string | null>(
    CURRENT_MONTH,
  );
  const [resolvedCurrentMonth, setResolvedCurrentMonth] = useState("");
  const [firstRow, setFirstRow] = useState("");
  const [lastRow, setLastRow] = useState("");
  const [rangeAssignee, setRangeAssignee] = useState("");
  const [reassignRange, setReassignRange] = useState(false);
  const [months, setMonths] = useState<string[]>([]);
  const [executives, setExecutives] = useState<Executive[]>([]);
  const [month, setMonth] = useState<string | null>(CURRENT_MONTH);
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
        const response = await fetch("/api/recovery-admin/allocation/options", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load allocation options.");
        setMonths(data.months);
        setExecutives(data.executives);
      } catch (error) {
        if (!controller.signal.aborted)
          toast.error(
            error instanceof Error ? error.message : "Could not load options.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [executive, revision]);
  useEffect(() => {
    if (!executive && month === null) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setFailed(false);
      setResolvedCurrentMonth(currentRecoveryMonth());
      try {
        const endpoint = executive
          ? "/api/recovery-executive/leads"
          : `/api/recovery-admin/allocation?month=${encodeURIComponent(month === CURRENT_MONTH ? currentRecoveryMonth() : month!)}`;
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load students.");
        setResolvedCurrentMonth(currentRecoveryMonth());
        setRecords(data.records);
        setTotal(data.total);
        setSelected([]);
      } catch (error) {
        if (!controller.signal.aborted) {
          setFailed(true);
          toast.error(
            error instanceof Error ? error.message : "Could not load students.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [executive, month, revision]);
  async function allocate(ids = selected, target = assignee, reassign = true) {
    setBusy(true);
    try {
      const response = await fetch("/api/recovery-admin/allocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids,
          assignedTo: target === "unassigned" ? null : target,
          month: month === CURRENT_MONTH ? resolvedCurrentMonth : month,
          reassign,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Allocation failed.");
      toast.success(
        `${data.updated} students ${target === "unassigned" ? "deallocated" : "allocated"}.${data.skipped ? ` ${data.skipped} already allocated rows skipped.` : ""}`,
      );
      setSelected([]);
      setRevision((value) => value + 1);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Allocation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const executiveMonths = [
    ...new Set(records.map((row) => row.selectedMonth)),
  ].sort();
  const visibleRecords = executive
    ? records.filter(
        (row) =>
          executiveMonth === null ||
          row.selectedMonth ===
            (executiveMonth === CURRENT_MONTH
              ? resolvedCurrentMonth
              : executiveMonth),
      )
    : records;
  return (
    <Card className="csv-records-card recovery-sheet-card">
      {executive && (
        <RecoveryStatisticsPanel
          rows={visibleRecords}
          individual
          loading={loading}
          failed={failed}
          month={executiveMonth}
          months={executiveMonths}
          currentMonthName={resolvedCurrentMonth}
          onMonthChange={setExecutiveMonth}
        />
      )}
      <div className="panel-heading">
        <h2>{executive ? "Students to call" : "Student allocation"}</h2>
        <div className="recovery-sheet-actions">
          {executive && <RecoveryMonthFilter month={executiveMonth} months={executiveMonths} currentMonthName={resolvedCurrentMonth} onChange={setExecutiveMonth} disabled={loading}/>}

        <Button
          variant="outline"
          disabled={busy || loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw /> Refresh
        </Button>
        </div>
      </div>
      {!executive && (
        <>
          <div className="auth-form csv-upload-form">
            <label>
              Month from CSV
              <RecoveryMonthFilter month={month} months={months} currentMonthName={resolvedCurrentMonth} allowAll={false} disabled={busy || loading} onChange={value => { setMonth(value); setFirstRow(""); setLastRow(""); setSelected([]); setRecords([]); }}/>

            </label>
            <label>
              Allocate to
              <Select
                value={assignee}
                disabled={busy}
                onValueChange={setAssignee}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select recovery executive" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {executives.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name} ({person.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button
              disabled={
                busy || loading || failed || !selected.length || !assignee
              }
              onClick={() => void allocate()}
            >
              {busy && <Loader2 className="animate-spin" />} Save allocation (
              {selected.length})
            </Button>
            <Button variant="outline" disabled={busy || loading || failed || !selected.length} onClick={() => void allocate(selected, "unassigned", true)}>Deallocate selected ({selected.length})</Button>
          </div>
          <form
            className="allocation-range-form"
            onSubmit={(event) => {
              event.preventDefault();
              try {
                const ids = numberedRowRange(
                  records.map((row) => row.id),
                  firstRow,
                  lastRow,
                );
                setSelected(ids);
                void allocate(ids, rangeAssignee, reassignRange);
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Choose a valid row range.",
                );
              }
            }}
          >
            <h3>Allocate a row range</h3>
            <div className="allocation-range-fields">
              <label>
                First row
                <Input
                  type="number"
                  min={1}
                  max={records.length}
                  step={1}
                  required
                  value={firstRow}
                  onChange={(event) => setFirstRow(event.target.value)}
                  disabled={busy || loading || month === null}
                />
              </label>
              <label>
                Last row
                <Input
                  type="number"
                  min={1}
                  max={records.length}
                  step={1}
                  required
                  value={lastRow}
                  onChange={(event) => setLastRow(event.target.value)}
                  disabled={busy || loading || month === null}
                />
              </label>
              <label>
                Recovery executive
                <Select
                  value={rangeAssignee}
                  onValueChange={setRangeAssignee}
                  disabled={busy || loading}
                  required
                >
                  <SelectTrigger aria-label="Executive for row range">
                    <SelectValue placeholder="Select executive" />
                  </SelectTrigger>
                  <SelectContent>
                    {executives.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name} ({person.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="allocation-range-reassign">
                <input
                  type="checkbox"
                  checked={reassignRange}
                  disabled={busy}
                  onChange={(event) => setReassignRange(event.target.checked)}
                />
                Reassign already allocated rows
              </label>
              <Button
                type="submit"
                disabled={
                  busy ||
                  loading ||
                  failed ||
                  month === null ||
                  !records.length ||
                  !firstRow ||
                  !lastRow ||
                  !rangeAssignee
                }
              >
                {busy && <Loader2 className="animate-spin" />}Allocate range
              </Button>
              <Button type="button" variant="outline" disabled={busy || loading || failed || month === null || !records.length || !firstRow || !lastRow} onClick={() => {
                try { const ids = numberedRowRange(records.map(row => row.id), firstRow, lastRow); setSelected(ids); void allocate(ids, "unassigned", true); }
                catch (error) { toast.error(error instanceof Error ? error.message : "Choose a valid row range."); }
              }}>Deallocate range</Button>
            </div>
           
          </form>
      
        </>
      )}
      {!executive && month === null ? (
        <p>Select a month to view students.</p>
      ) : loading ? (
        <p>Loading students…</p>
      ) : failed ? (
        <p>Could not load students. Use Refresh to retry.</p>
      ) : (
        <>

          <p className="csv-help">
            {executive ? visibleRecords.length : total} students
            {executive ? " assigned to you" : " in this month"}.
          </p>
          {visibleRecords.length ? (
            <AllocationSheet
              rows={visibleRecords}
              executives={executives}
              selected={selected}
              onSelect={setSelected}
              disabled={busy}
              executive={executive}
              onStatusSaved={(id, field, value) =>
                setRecords((current) =>
                  current.map((row) =>
                    row.id === id ? { ...row, [field]: value } : row,
                  ),
                )
              }
            />
          ) : (
            <p>
              {executive
                ? "No students allocated to you yet."
                : "No students found for this month."}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
