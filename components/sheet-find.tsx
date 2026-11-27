"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { leadColumns } from "@/lib/recovery/columns";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
type Match = { id: string; index: number; page?: number };
type Row = { id?: string } & Partial<Record<keyof typeof leadColumns, string>>;
export type SheetSearchSource = { endpoint: string; onPage: (page: number) => void };
export function SheetFind({ rows, root, source }: { rows: Row[]; root: RefObject<HTMLDivElement | null>; source?: SheetSearchSource }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ top: 0, right: 8 });
  const previousFocus = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<{ key: string; matches: Match[] } | null>(null);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const close = () => {
    setOpen(false); setQuery(""); setError("");
    if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const bounds = root.current?.getBoundingClientRect();
      if (!bounds) return;
      const header = root.current?.closest(".app-main")?.querySelector(".dashboard-header")?.getBoundingClientRect();
      const top = Math.min(window.innerHeight - 100, Math.max(8, header?.bottom || 0, bounds.top) + 8);
      const right = Math.max(8, window.innerWidth - bounds.right + 8);
      setPlacement(old => old.top === top && old.right === right ? old : { top, right });
    };
    place();
    input.current?.focus();
    input.current?.select();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, root]);
  const term = query.trim().toLowerCase();
  const endpoint = source?.endpoint;
  const key = `${endpoint || ""}|${term}`;
  const local = useMemo(() => term && !endpoint ? rows.flatMap((row, index) => Object.keys(leadColumns).some(field => String(row[field as keyof typeof leadColumns] || "").toLowerCase().includes(term)) ? [{ id: row.id || String(index), index }] : []) : [], [rows, term, endpoint]);
  const matches: Match[] = endpoint ? remote?.key === key ? remote.matches : [] : local;
  const active = matches[position % (matches.length || 1)];
  const onPage = useRef(source?.onPage);
  useEffect(() => { onPage.current = source?.onPage; });
  useEffect(() => {
    if (!endpoint || !term) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}q=${encodeURIComponent(term)}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Search failed.");
        if (!controller.signal.aborted) setRemote({ key, matches: data.matches });
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Search failed."); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [endpoint, term, key]);
  useEffect(() => {
    const container = root.current;
    container?.querySelectorAll("[data-sheet-search-match]").forEach(cell => cell.removeAttribute("data-sheet-search-match"));
    if (!active || !container) return;
    const index = rows.findIndex((row, index) => (row.id || String(index)) === active.id);
    if (index < 0) { if (active.page) onPage.current?.(active.page); return; }
    const virtual = container.querySelector("[data-virtual-sheet]");
    if (virtual) {
      virtual.parentElement?.dispatchEvent(new CustomEvent("sheet-navigate-cell", { detail: { rowIndex: index, search: term } }));
      return;
    }
    const row = Array.from(container.querySelectorAll<HTMLElement>("[data-sheet-row-id]")).find(row => row.dataset.sheetRowId === active.id);
    const cell = Array.from(row?.querySelectorAll<HTMLElement>("td") || []).find(cell => (cell.dataset.copyValue || cell.textContent || "").toLowerCase().includes(term)) || row;
    cell?.setAttribute("data-sheet-search-match", "true");
    cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, rows, root, term]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (document.activeElement instanceof HTMLElement && document.activeElement !== input.current) previousFocus.current = document.activeElement;
        setOpen(true);
        input.current?.focus(); input.current?.select();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [root]);
  const move = (direction: number) => setPosition(value => (value + direction + matches.length) % (matches.length || 1));
  if (!open) return null;
  return createPortal(<div className="sheet-find" style={placement} role="search" aria-label="Find in recovery sheet" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <Input ref={input} maxLength={200} aria-label="Find in sheet" placeholder="Find in sheet…" value={query} onChange={event => { setQuery(event.target.value); setPosition(0); setError(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); move(event.shiftKey ? -1 : 1); } }}/>
    <span role="status">{error || (term ? endpoint && remote?.key !== key ? "Searching…" : `${matches.length ? position % matches.length + 1 : 0} of ${matches.length}` : "Search any column")}</span>
    <Button variant="outline" disabled={!matches.length} aria-label="Previous match" onClick={() => move(-1)}>↑</Button>
    <Button variant="outline" disabled={!matches.length} aria-label="Next match" onClick={() => move(1)}>↓</Button>
    {query && <Button variant="ghost" onClick={() => { setQuery(""); setError(""); input.current?.focus(); }}>Clear</Button>}
    <Button variant="ghost" aria-label="Close find in sheet" onClick={close}>×</Button>
  </div>, document.body);
}
