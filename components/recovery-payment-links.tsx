"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Loader2, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
type Update = { leadId: string; url: string };
type Job = { mode: "test" | "live"; id: string; status: string; selectedMonth: string | null; total: number; counts: Record<string, number>; updates: Update[]; issues: { id: string; studentName: string; status: string; reason: string }[] };
export function RecoveryPaymentLinks({ month, disabled, onUpdates }: { month: string | null; disabled: boolean; onUpdates: (updates: Update[]) => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const stopRequested = useRef(false);
  const accept = useCallback((next: Job | null) => {
    // A process response may race the Stop response. Never restart local polling
    // from an older running snapshot after the user requested a stop.
    if (stopRequested.current && next?.status === "running") return;
    if (next?.status === "stopped" || next?.status === "completed") stopRequested.current = false;
    setJob(next);
    if (next?.updates.length) onUpdates(next.updates);
  }, [onUpdates]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setChecking(true);
      try {
        const response = await fetch(`/api/recovery-admin/payment-links${month === null ? "" : `?month=${encodeURIComponent(month)}`}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load payment-link progress.");
        accept(data.job); setError("");
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load payment-link progress."); }
      finally { if (!controller.signal.aborted) setChecking(false); }
    }
    void load();
    return () => controller.abort();
  }, [month, accept]);
  const activeJobId = job?.id;
  const activeJobStatus = job?.status;
  useEffect(() => {
    if (!activeJobId || !["running", "stopping"].includes(activeJobStatus || "")) return;
    const id = activeJobId;
    let lastCompleted = -1;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      let delay = 3000;
      try {
        const response = await fetch("/api/recovery-admin/payment-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "process", jobId: id }), signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not continue generation.");
        accept(data.job); setError("");
        const counts = data.job.counts;
        const completed = (counts.generated || 0) + (counts.reused || 0) + (counts.skipped || 0) + (counts.failed || 0);
        // Continue promptly after useful work; back off while a worker owns the lease.
        delay = completed > lastCompleted ? 200 : 1500;
        lastCompleted = completed;
        if (data.job.status === "stopped") { toast.success("Generation stopped. Existing links were kept."); return; }
        if (data.job.status === "completed") {
          toast.success(`Payment links processed: ${data.job.counts.generated || 0} generated, ${data.job.counts.reused || 0} reused, ${data.job.counts.failed || 0} failed.`);
          return;
        }
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Generation interrupted; it can resume safely."); }
      if (!controller.signal.aborted) timer = setTimeout(() => void tick(), delay);
    }
    timer = setTimeout(() => void tick(), 200);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [activeJobId, activeJobStatus, accept]);
  async function act(action: "start" | "retry" | "stop" | "resume") {
    if (action === "stop") stopRequested.current = true;
    if (action === "start" || action === "resume") stopRequested.current = false;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/recovery-admin/payment-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, month, jobId: job?.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start payment-link generation.");
      accept(data.job);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate payment links.";
      if (action === "stop") stopRequested.current = false;
      setError(message); toast.error(message);
    } finally { setBusy(false); }
  }
  const active = job?.status === "running" || job?.status === "stopping";
  const completed = job ? (job.counts.generated || 0) + (job.counts.reused || 0) + (job.counts.skipped || 0) + (job.counts.failed || 0) : 0;
  return <div className="payment-link-controls">
    <Button variant="outline" disabled={disabled || checking || busy || active} onClick={() => void act(job?.status === "stopped" ? "resume" : "start")}>{active || busy ? <Loader2 className="animate-spin"/> : <Link2/>}{job?.status === "stopping" ? "Stopping…" : active ? "Generating links…" : job?.status === "stopped" ? "Resume generation" : "Generate payment links"}</Button>
    {active && <Button variant="destructive" disabled={busy || job?.status === "stopping"} onClick={() => void act("stop")}><Square/>{job?.status === "stopping" ? "Stopping…" : "Stop generation"}</Button>}
    {(job || error) && <div className="payment-link-progress">
      {job && <><div className="payment-link-status" role="status"><strong>{job.status === "stopped" ? "Stopped · " : job.status === "stopping" ? "Stopping · " : ""}{job.mode === "live" ? "Live" : "Test"} payment links · {job.selectedMonth ?? "All months"}</strong><span>{completed} / {job.total} processed · {job.counts.generated || 0} generated · {job.counts.reused || 0} reused · {job.counts.skipped || 0} skipped · {job.counts.failed || 0} failed</span>{job.status === "completed" && Boolean(job.counts.failed) && <Button variant="outline" disabled={busy} onClick={() => void act("retry")}>Retry failed</Button>}</div><progress aria-label="Payment-link generation progress" value={completed} max={Math.max(1, job.total)}/>{job.issues.length > 0 && <details><summary>Skipped / failed students (up to 30)</summary><ul>{job.issues.map(issue => <li key={issue.id}>{issue.studentName || "Unnamed student"}: {issue.reason}</li>)}</ul></details>}</>}
      {error && <p role="alert">{error}</p>}
    </div>}
  </div>;
}
