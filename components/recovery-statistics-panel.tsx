"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { ChartNoAxesCombined, X } from "lucide-react";
import { Button } from "./ui/button";
import { RecoveryLeaderboard } from "./recovery-leaderboard";
import type { RecoverySummaryRow } from "@/lib/recovery/summary";
const StatisticsContext = createContext<{ openPath: string | null; setOpenPath: (path: string | null) => void } | null>(null);
export function RecoveryStatisticsProvider({ children }: { children: ReactNode }) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  return <StatisticsContext.Provider value={{ openPath, setOpenPath }}>{children}</StatisticsContext.Provider>;
}
export function RecoveryStatisticsButton() {
  const state = useContext(StatisticsContext);
  const pathname = usePathname();
  if (!state || !["/recovery-dashboard", "/recovery-executive-dashboard"].includes(pathname)) return null;
  return <Button variant="ghost" className="statistics-navbar-button" aria-haspopup="dialog" aria-expanded={state.openPath === pathname} onClick={() => state.setOpenPath(state.openPath === pathname ? null : pathname)}><ChartNoAxesCombined size={17}/>Statistics</Button>;
}
export function RecoveryStatisticsPanel({ rows, executives = [], individual = false, loading = false, failed = false, scope }: {
  rows: RecoverySummaryRow[]; executives?: { id: string; name: string; email: string }[]; individual?: boolean; loading?: boolean; failed?: boolean; scope?: string;
}) {
  const state = useContext(StatisticsContext);
  const pathname = usePathname();
  if (!state) return null;
  return <Dialog.Root open={state.openPath === pathname} onOpenChange={open => state.setOpenPath(open ? pathname : null)}><Dialog.Portal><Dialog.Overlay className="statistics-panel-overlay"/><Dialog.Content className="statistics-panel" onCloseAutoFocus={event => { event.preventDefault(); document.querySelector<HTMLButtonElement>(".statistics-navbar-button")?.focus(); }}><header className="statistics-panel-heading"><div><Dialog.Title>Recovery statistics</Dialog.Title><Dialog.Description>{individual ? "Your assigned students" : scope || "All months"}</Dialog.Description></div><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close statistics"><X/></Button></Dialog.Close></header><div className="statistics-panel-body">{loading ? <p>Loading statistics…</p> : failed ? <p>Statistics could not be loaded. Close this panel and use Refresh to retry.</p> : <RecoveryLeaderboard rows={rows} executives={executives} individual={individual}/>}</div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
