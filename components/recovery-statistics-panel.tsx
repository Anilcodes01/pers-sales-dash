"use client";
import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { ChartNoAxesCombined, RefreshCw, X } from "lucide-react";
import { RecoveryMonthFilter } from "./recovery-month-filter";
import { Button } from "./ui/button";
import { CURRENT_MONTH, currentRecoveryMonth } from "@/lib/recovery/month";
import { RecoveryLeaderboard, type RecoveryStatisticsData } from "./recovery-leaderboard";
import type { RecoverySummaryRow } from "@/lib/recovery/summary";
const StatisticsContext = createContext<{ openPath: string | null; setOpenPath: (path: string | null) => void } | null>(null);
export function RecoveryStatisticsProvider({ children }: { children: ReactNode }) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  return <StatisticsContext.Provider value={{ openPath, setOpenPath }}>{children}</StatisticsContext.Provider>;
}
export function RecoveryStatisticsButton({ enabled = false }: { enabled?: boolean }) {
  const state = useContext(StatisticsContext);
  const pathname = usePathname();
  if (!state || !enabled) return null;
  return <Button variant="ghost" className="statistics-navbar-button" aria-haspopup="dialog" aria-expanded={state.openPath === pathname} onClick={() => state.setOpenPath(state.openPath === pathname ? null : pathname)}><ChartNoAxesCombined size={17}/>Statistics</Button>;
}
export function RecoveryStatisticsPanel({ individual = false, month, months = [], currentMonthName }: {
  rows?: RecoverySummaryRow[]; executives?: { id: string; name: string; email: string }[]; individual?: boolean; loading?: boolean; failed?: boolean; scope?: string; month?: string | null; months?: string[]; currentMonthName?: string; onMonthChange?: (month: string | null) => void;
}) {
  const state = useContext(StatisticsContext);
  const pathname = usePathname();
  const open = state?.openPath === pathname;
  const [panelMonth, setPanelMonth] = useState<string | null | undefined>(undefined);
  const [statistics, setStatistics] = useState<RecoveryStatisticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const cache = useRef(new Map<string, RecoveryStatisticsData>());
  const selectedMonth = panelMonth === undefined ? (month === undefined ? CURRENT_MONTH : month) : panelMonth;
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const key = JSON.stringify([individual, selectedMonth, revision]);
    async function load() {
      const cached = cache.current.get(key);
      if (cached) { setStatistics(cached); setLoading(false); setFailed(false); return; }
      setLoading(true); setFailed(false);
      try {
        const resolved = selectedMonth === CURRENT_MONTH ? currentRecoveryMonth() : selectedMonth;
        const response = await fetch(`/api/${individual ? "recovery-executive" : "recovery-admin"}/statistics${resolved === null ? "" : `?month=${encodeURIComponent(resolved)}`}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load statistics.");
        cache.current.set(key, data); setStatistics(data);
      } catch { if (!controller.signal.aborted) setFailed(true); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [open, individual, selectedMonth, revision]);
  useEffect(() => {
    const refresh = () => { cache.current.clear(); setRevision(value => value + 1); };
    window.addEventListener("recovery-period-changed", refresh);
    return () => window.removeEventListener("recovery-period-changed", refresh);
  }, []);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => { if (!document.hidden) { cache.current.clear(); setRevision(value => value + 1); } }, 15000);
    return () => clearInterval(timer);
  }, [open]);
  if (!state) return null;
  return <Dialog.Root open={open} onOpenChange={value => state.setOpenPath(value ? pathname : null)}><Dialog.Portal><Dialog.Overlay className="statistics-panel-overlay"/><Dialog.Content className="statistics-panel" onCloseAutoFocus={event => { event.preventDefault(); document.querySelector<HTMLButtonElement>(".statistics-navbar-button")?.focus(); }}><header className="statistics-panel-heading"><div><Dialog.Title>Recovery statistics</Dialog.Title><Dialog.Description>{individual ? "Your assigned students" : "Recovery overview"}</Dialog.Description></div><div className="statistics-heading-actions"><label className="statistics-month-filter">Month<RecoveryMonthFilter month={selectedMonth} months={statistics?.months || months} currentMonthName={currentMonthName} onChange={setPanelMonth} disabled={loading} label="Statistics month"/></label><Button variant="ghost" size="icon" aria-label="Refresh statistics" title="Refresh statistics" disabled={loading} onClick={() => { cache.current.clear(); setRevision(value => value + 1); }}><RefreshCw className={loading ? "animate-spin" : ""}/></Button><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close statistics"><X/></Button></Dialog.Close></div></header><div className="statistics-panel-body">{loading ? <p>Loading statistics…</p> : failed ? <p>Statistics could not be loaded. Use Refresh above to retry.</p> : statistics ? <RecoveryLeaderboard statistics={statistics} individual={individual}/> : <p>Loading statistics…</p>}</div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
