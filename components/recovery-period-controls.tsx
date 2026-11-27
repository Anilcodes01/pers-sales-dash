"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
type Period = { startedAt: string; endedAt: string | null };
export function RecoveryPeriodControls() {
  const [period, setPeriod] = useState<Period | null>(null);
  const [recovery, setRecovery] = useState<{ month: string; total: number; paid: number; percentage: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/recovery-admin/period", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPeriod(data.period); setRecovery(data.recovery); setFailed(false);
    } catch { setFailed(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => { void load(); }, 0);
    const refresh = () => { void load(); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 30000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [load]);
  async function update(action: "start" | "end") {
    setBusy(true);
    try {
      const response = await fetch("/api/recovery-admin/period", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update recovery period.");
      setPeriod(data.period);
      window.dispatchEvent(new Event("recovery-period-changed"));
      toast.success(action === "start" ? "Recovery started." : "Recovery ended.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update recovery period."); void load(); }
    finally { setBusy(false); }
  }
  if (failed) return <Button variant="ghost" disabled={loading} onClick={() => void load()}>Retry recovery controls</Button>;
  const active = Boolean(period && !period.endedAt);
  return <div className="recovery-period-controls" aria-label="Recovery period">
    <span className="navbar-recovery-total" title={`${recovery?.month || "Current recovery month"}: paid students / total students`} aria-label="Total recovery">
      Recovery <strong>{recovery ? `${recovery.percentage.toFixed(1)}%` : "—"}</strong>
      {recovery && <span>{recovery.paid} / {recovery.total}</span>}
    </span>
    <Button variant="outline" className="recovery-start-button" disabled={loading || busy || active} onClick={() => void update("start")}>Start recovery</Button>
    <Button variant="outline" className="recovery-end-button" disabled={loading || busy || !active} onClick={() => void update("end")}>End recovery</Button>
  </div>;
}
