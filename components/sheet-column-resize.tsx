"use client";

import { useEffect } from "react";

const MIN_WIDTH = 64;
const MAX_WIDTH = 1200;
const clamp = (width: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));

export function SheetColumnResize() {
  useEffect(() => {
    type Sheet = { headers: HTMLTableCellElement[]; key: string; widths: number[] | null };
    const sheets = new WeakMap<HTMLTableElement, Sheet>();
    let drag: { table: HTMLTableElement; sheet: Sheet; index: number; x: number; width: number; pointer: number; column: HTMLTableColElement | null; total: number; nextWidth: number; handle: HTMLTableCellElement } | null = null;
    let frame = 0;
    let hovered: HTMLTableCellElement | null = null;
    function apply(table: HTMLTableElement, sheet: Sheet) {
      if (!sheet.widths) return;
      const columns = table.querySelectorAll<HTMLTableColElement>(":scope > colgroup > col");
      sheet.widths.forEach((width, index) => {
        sheet.headers[index].style.width = `${width}px`;
        if (columns[index]) columns[index].style.width = `${width}px`;
      });
      const total = sheet.widths.reduce((sum, width) => sum + width, 0);
      table.style.width = `${total}px`;
      table.style.minWidth = `${total}px`;
    }
    function persist(sheet: Sheet) {
      try { localStorage.setItem(sheet.key, JSON.stringify(sheet.widths)); } catch { /* Resizing still works when storage is disabled. */ }
    }
    function prepare() {
      document.querySelectorAll<HTMLTableElement>(".app-main table").forEach(table => {
        const headers = Array.from(table.tHead?.rows[0]?.cells || []);
        if (!headers.length || headers.some(header => header.colSpan !== 1)) return;
        if (sheets.get(table)?.headers[0] === headers[0]) return;
        const key = `sheet-widths:v1:${location.pathname}:${JSON.stringify(headers.map(header => header.textContent?.trim()))}`;
        const sheet: Sheet = { headers, key, widths: null };
        try {
          const stored: unknown = JSON.parse(localStorage.getItem(key) || "null");
          if (Array.isArray(stored) && stored.length === headers.length && stored.every(width => typeof width === "number" && Number.isFinite(width))) sheet.widths = stored.map(clamp);
        } catch { /* Ignore unavailable or outdated preferences. */ }
        headers.forEach(header => {
          header.dataset.resizableColumn = "true";
          header.tabIndex = 0;
          header.setAttribute("aria-description", "Drag the right edge to resize. Use Alt plus Left or Right Arrow to adjust column width.");
        });
        sheets.set(table, sheet);
        apply(table, sheet);
      });
    }
    function headerAt(event: PointerEvent) {
      if (!(event.target instanceof Element)) return null;
      const header = event.target.closest<HTMLTableCellElement>('thead th[data-resizable-column="true"]');
      if (!header) return null;
      const bounds = header.getBoundingClientRect();
      return Math.abs(bounds.right - event.clientX) <= 8 ? header : null;
    }
    function freeze(table: HTMLTableElement, sheet: Sheet) {
      if (!sheet.widths) sheet.widths = sheet.headers.map(header => Math.round(header.getBoundingClientRect().width));
      apply(table, sheet);
    }
    function down(event: PointerEvent) {
      if (event.button !== 0) return;
      const header = headerAt(event);
      const table = header?.closest("table");
      if (!header || !table) return;
      const sheet = sheets.get(table);
      if (!sheet) return;
      event.preventDefault(); event.stopPropagation();
      freeze(table, sheet);
      const index = sheet.headers.indexOf(header);
      const width = sheet.widths![index];
      // Resolve DOM nodes and totals once, outside the pointer-move hot path.
      drag = { table, sheet, index, x: event.clientX, width, pointer: event.pointerId,
        column: table.querySelectorAll<HTMLTableColElement>(":scope > colgroup > col")[index] || null,
        total: sheet.widths!.reduce((sum, value) => sum + value, 0), nextWidth: width, handle: header };
      header.setPointerCapture(event.pointerId);
      document.body.classList.add("sheet-column-resizing");
      header.focus({ preventScroll: true });
    }
    function move(event: PointerEvent) {
      if (drag && drag.pointer === event.pointerId) {
        event.preventDefault();
        drag.nextWidth = clamp(drag.width + event.clientX - drag.x);
        // Coalesce fast pointer events into a single write per rendered frame.
        if (!frame) frame = requestAnimationFrame(flush);
        return;
      }
      const header = headerAt(event);
      if (hovered !== header) {
        hovered?.removeAttribute("data-resize-hover");
        hovered = header;
        hovered?.setAttribute("data-resize-hover", "true");
      }
    }
    function flush() {
      frame = 0;
      if (!drag || drag.sheet.widths![drag.index] === drag.nextWidth) return;
      const width = drag.nextWidth;
      drag.sheet.widths![drag.index] = width;
      drag.sheet.headers[drag.index].style.width = `${width}px`;
      if (drag.column) drag.column.style.width = `${width}px`;
      const total = drag.total + width - drag.width;
      drag.table.style.width = `${total}px`;
      drag.table.style.minWidth = `${total}px`;
    }
    function stop() {
      // Commit the final pointer position even if release precedes the next frame.
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      flush();
      const finished = drag;
      drag = null;
      if (finished) {
        persist(finished.sheet);
        if (finished.handle.hasPointerCapture(finished.pointer)) finished.handle.releasePointerCapture(finished.pointer);
      }
      document.body.classList.remove("sheet-column-resizing");
    }
    function keydown(event: KeyboardEvent) {
      if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key) || !(event.target instanceof HTMLTableCellElement)) return;
      const table = event.target.closest("table");
      const sheet = table && sheets.get(table);
      if (!table || !sheet || !sheet.headers.includes(event.target)) return;
      event.preventDefault(); event.stopPropagation();
      freeze(table, sheet);
      const index = sheet.headers.indexOf(event.target);
      sheet.widths![index] = clamp(sheet.widths![index] + (event.key === "ArrowRight" ? 16 : -16));
      apply(table, sheet); persist(sheet);
    }
    function edgeClick(event: MouseEvent) {
      if (event.target instanceof Element && event.target.closest('[data-resize-hover="true"]')) { event.preventDefault(); event.stopPropagation(); }
    }
    prepare();
    let prepareFrame = 0;
    const observer = new MutationObserver(records => {
      const structural = records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.matches('table, thead, th[scope="col"]') || node.querySelector('table, thead'))));
      if (structural && !prepareFrame) prepareFrame = requestAnimationFrame(() => { prepareFrame = 0; prepare(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, { capture: true, passive: false });
    document.addEventListener("pointerup", stop, true);
    document.addEventListener("pointercancel", stop, true);
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("click", edgeClick, true);
    document.addEventListener("dblclick", edgeClick, true);
    window.addEventListener("blur", stop);
    return () => {
      stop(); observer.disconnect(); cancelAnimationFrame(prepareFrame); hovered?.removeAttribute("data-resize-hover");
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", stop, true);
      document.removeEventListener("pointercancel", stop, true);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("click", edgeClick, true);
      document.removeEventListener("dblclick", edgeClick, true);
      window.removeEventListener("blur", stop);
    };
  }, []);
  return null;
}
