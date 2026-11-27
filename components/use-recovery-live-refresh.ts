"use client";
import { useEffect, useState, type RefObject } from "react";
// Quiet polling keeps assignments scoped by the server; no privileged browser DB client.
export function useRecoveryLiveRefresh(endpoint: string | null, onData: (data: Record<string, unknown>) => void, cursor?: RefObject<string | null>) {
  const [status, setStatus] = useState<"current" | "reconnecting">("current");
  useEffect(() => {
    if (!endpoint) return;
    const controller = new AbortController();
    let inFlight = false;
    let mutation = 0;
    let retry: ReturnType<typeof setTimeout>;
    const editing = () => Boolean(document.querySelector('textarea:focus, input:focus, .status-saving, [role="listbox"]'));
    async function refresh() {
      if (inFlight || document.hidden || editing() || (cursor && cursor.current === null)) return;
      inFlight = true;
      const epoch = mutation;
      const requestedCursor = cursor?.current;
      try {
        const syncEndpoint = cursor ? `${endpoint}${endpoint!.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor.current!)}` : endpoint!;
        const response = await fetch(syncEndpoint, { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          if (!controller.signal.aborted && !editing() && mutation === epoch && (!cursor || cursor.current === requestedCursor)) {
            if (!data.unchanged) onData(data);
            if (cursor && typeof data.cursor === "string") cursor.current = data.cursor;
            setStatus("current");
          }
        } else if (!controller.signal.aborted) setStatus("reconnecting");
      } catch { if (!controller.signal.aborted) setStatus("reconnecting"); }
      finally { inFlight = false; }
    }
    const timer = setInterval(() => void refresh(), 10000);
    const focus = () => { void refresh(); };
    const saved = () => { mutation++; clearTimeout(retry); retry = setTimeout(() => void refresh(), 250); };
    window.addEventListener("recovery-sheet-saved", saved);
    window.addEventListener("recovery-sheet-refresh", focus);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => { controller.abort(); clearInterval(timer); clearTimeout(retry); window.removeEventListener("recovery-sheet-saved", saved); window.removeEventListener("recovery-sheet-refresh", focus); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [endpoint, onData, cursor]);
  return status;
}
