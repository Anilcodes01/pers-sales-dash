"use client";
import { useEffect } from "react";
// Quiet polling keeps assignments scoped by the server; no privileged browser DB client.
export function useRecoveryLiveRefresh(endpoint: string | null, onData: (data: Record<string, unknown>) => void) {
  useEffect(() => {
    if (!endpoint) return;
    const controller = new AbortController();
    let inFlight = false;
    const editing = () => Boolean(document.querySelector('textarea:focus, input:focus, .status-saving, [role="listbox"]'));
    async function refresh() {
      if (inFlight || document.hidden || editing()) return;
      inFlight = true;
      try {
        const response = await fetch(endpoint!, { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          if (!controller.signal.aborted && !editing()) onData(data);
        }
      } catch { /* Transient background failures retain the current sheet. */ }
      finally { inFlight = false; }
    }
    const timer = setInterval(() => void refresh(), 10000);
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [endpoint, onData]);
}
