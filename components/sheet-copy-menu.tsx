"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Rows3, Expand, X } from "lucide-react";
import { Popover } from "radix-ui";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./ui/dropdown-menu";

// Read displayed cell content, excluding selection controls and saving indicators.
function cellText(cell: HTMLTableCellElement) {
  if (cell.hasAttribute("data-copy-value")) return cell.getAttribute("data-copy-value") || "";
  const clone = cell.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('svg, input[type="checkbox"], .status-saving, .sr-only, [aria-hidden="true"], [data-copy-ignore]').forEach(node => node.remove());
  const editors = Array.from(cell.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input:not([type=checkbox]), textarea, select"));
  clone.querySelectorAll("input, textarea, select").forEach((node, index) => {
    node.replaceWith(document.createTextNode(editors[index]?.value || ""));
  });
  clone.querySelectorAll("small, p, br").forEach(node => node.before(document.createTextNode("\n")));
  return (clone.textContent || "").trim();
}
function rowText(cell: HTMLTableCellElement) {
  const row = cell.closest("tr");
  if (!row) return cellText(cell);
  return Array.from(row.cells).map(item => {
    const text = cellText(item);
    // TSV quoting lets multi-line comments paste into a single spreadsheet cell.
    return /[\t\r\n"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join("\t");
}
async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.appendChild(field);
  try {
    field.select();
    if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
  } finally { field.remove(); }
}

type Target = { x: number; y: number; cell: string; row: string; label: string; bottom: number };
export function SheetCopyMenu() {
  const [target, setTarget] = useState<Target | null>(null);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const selected = useRef<HTMLTableCellElement | null>(null);
  const viewAfterMenuClose = useRef(false);
  const viewerText = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    function select(cell: HTMLTableCellElement | null) {
      selected.current?.removeAttribute("data-sheet-active");
      selected.current = cell;
      cell?.setAttribute("data-sheet-active", "true");
    }
    function snapshot(cell: HTMLTableCellElement, x: number, y: number) {
      const header = cell.closest("table")?.tHead?.rows[0]?.cells[cell.cellIndex];
      return { x, y, bottom: cell.getBoundingClientRect().bottom, cell: cellText(cell), row: rowText(cell), label: header?.textContent?.trim() || "Cell value" };
    }
    function click(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('.sheet-copy-menu, .sheet-cell-viewer, .sheet-copy-anchor')) return;
      const cell = event.target.closest<HTMLTableCellElement>("td, th");
      select(cell);
      if (cell && !event.target.closest('button, a, input, textarea, select, [contenteditable="true"]')) {
        cell.tabIndex = -1;
        cell.focus({ preventScroll: true });
      }
    }
    function show(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      // Keep native editing/selection menus inside active text editors.
      if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const cell = event.target.closest<HTMLTableCellElement>("td, th");
      if (!cell || !cell.closest("table")) return;
      event.preventDefault();
      event.stopPropagation();
      select(cell);
      const bounds = cell.getBoundingClientRect();
      setTarget(snapshot(cell, event.type === "dblclick" ? bounds.left : event.clientX, event.type === "dblclick" ? bounds.top : event.clientY));
      if (event.type === "dblclick") { setOpen(false); setExpanded(false); setViewing(true); }
      else { setViewing(false); setOpen(true); }
    }
    function close(event: Event) {
      if (event.target instanceof Element && event.target.closest('[data-slot="dropdown-menu-content"], .sheet-cell-viewer')) return;
      // A focus/layout scroll must not dismiss the full-value viewer.
      // Radix handles its outside-click and Escape dismissal.
      setOpen(false);
    }
    function keydown(event: KeyboardEvent) {
      if (event.altKey) return;
      const cell = selected.current;
      if (!cell?.isConnected || !(event.target instanceof Element) || event.target.closest('input, textarea, select, button, a, [role="menu"], .sheet-cell-viewer, [contenteditable="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && !window.getSelection()?.toString()) {
        event.preventDefault();
        void writeClipboard(cellText(cell)).then(() => toast.success("Cell copied."), () => toast.error("Could not copy cell."));
      }
      if (event.key === "Enter" || event.key === "F2") {
        event.preventDefault();
        const bounds = cell.getBoundingClientRect();
        setTarget(snapshot(cell, bounds.left, bounds.top));
        setExpanded(false); setOpen(false); setViewing(true);
      }
      if (event.key === "Escape") { select(null); setOpen(false); setViewing(false); }
      const row = cell.parentElement as HTMLTableRowElement;
      const table = cell.closest("table");
      let next: HTMLTableCellElement | undefined;
      if (event.key === "ArrowLeft") next = row.cells[cell.cellIndex - 1];
      if (event.key === "ArrowRight") next = row.cells[cell.cellIndex + 1];
      if (event.key === "ArrowUp") next = table?.rows[row.rowIndex - 1]?.cells[cell.cellIndex];
      if (event.key === "ArrowDown") next = table?.rows[row.rowIndex + 1]?.cells[cell.cellIndex];
      if (next) { event.preventDefault(); select(next); next.tabIndex = -1; next.focus({ preventScroll: true }); next.scrollIntoView({ block: "nearest", inline: "nearest" }); }
    }
    // Observe structural changes only, so selection styling does not retrigger this.
    function prepareTables() {
      document.querySelectorAll<HTMLTableElement>(".app-main table").forEach(table => {
        const columns = table.tHead?.rows[0]?.cells.length || table.rows[0]?.cells.length || 1;
        table.style.setProperty("--sheet-columns", String(columns));
      });
    }
    prepareTables();
    const observer = new MutationObserver(prepareTables);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("contextmenu", show, true);
    document.addEventListener("dblclick", show, true);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      observer.disconnect();
      selected.current?.removeAttribute("data-sheet-active");
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("contextmenu", show, true);
      document.removeEventListener("dblclick", show, true);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, []);
  async function copy(kind: "cell" | "row") {
    if (!target) return;
    try {
      await writeClipboard(target[kind]);
      toast.success(kind === "cell" ? "Cell copied." : "Row copied.");
    } catch { toast.error("Could not copy. Please allow clipboard access and try again."); }
  }
  return <><DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
    <DropdownMenuTrigger className="sheet-copy-anchor" aria-label="Sheet copy options" tabIndex={-1} style={{ left: target?.x ?? 0, top: target?.y ?? 0 }}/>
    <DropdownMenuContent className="sheet-copy-menu" align="start" sideOffset={2} collisionPadding={8} onCloseAutoFocus={event => {
      event.preventDefault();
      if (viewAfterMenuClose.current) {
        viewAfterMenuClose.current = false;
        // Wait until the menu's focus scope is removed before mounting the viewer.
        requestAnimationFrame(() => setViewing(true));
      }
    }}>
      <DropdownMenuItem onSelect={() => { setExpanded(false); viewAfterMenuClose.current = true; setOpen(false); }}><Expand/>View full value</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => void copy("cell")}><Copy/>Copy cell</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => void copy("row")}><Rows3/>Copy row</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
  <Popover.Root open={viewing} onOpenChange={setViewing}>
    <Popover.Anchor asChild><span className="sheet-copy-anchor" style={{ left: target?.x ?? 0, top: target?.bottom ?? 0 }}/></Popover.Anchor>
    <Popover.Portal><Popover.Content className={`sheet-cell-viewer${expanded ? " is-expanded" : ""}`} align="start" sideOffset={4} collisionPadding={12} aria-label="Full cell value" onOpenAutoFocus={event => {
      event.preventDefault();
      viewerText.current?.focus({ preventScroll: true });
      viewerText.current?.setSelectionRange(0, 0);
    }} onCloseAutoFocus={event => { event.preventDefault(); if (selected.current?.isConnected) selected.current.focus({ preventScroll: true }); }}>
      <header><strong>{target?.label}</strong><div><Button variant="ghost" size="icon" aria-label={expanded ? "Collapse value" : "Expand value"} onClick={() => setExpanded(value => !value)}><Expand size={16}/></Button><Popover.Close asChild><Button variant="ghost" size="icon" aria-label="Close cell value"><X size={16}/></Button></Popover.Close></div></header>
      <textarea ref={viewerText} aria-label="Full cell content" readOnly value={target?.cell ?? ""}/>
      <footer><Button variant="outline" onClick={() => void copy("cell")}><Copy size={16}/>Copy cell</Button><Button variant="ghost" onClick={() => void copy("row")}><Rows3 size={16}/>Copy row</Button><span>Esc to close</span></footer>
    </Popover.Content></Popover.Portal>
  </Popover.Root></>;
}
