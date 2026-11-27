"use client";
import { cloneElement, Fragment, memo, useCallback, useEffect, useRef, useState, type ComponentProps, type ReactElement } from "react";
import { useTableViewport } from "./use-table-viewport";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
type RenderRow<T> = (row: T, index: number) => ReactElement<ComponentProps<"tr">>;
const MeasuredRow = memo(function MeasuredRow<T>({ row, index, render, measure }: { row: T; index: number; render: RenderRow<T>; measure: (node: HTMLTableRowElement | null) => void }) {
  return cloneElement(render(row, index), { ref: measure, "data-index": index, "data-student-index": index, "aria-rowindex": index + 2 } as ComponentProps<"tr">);
});
export function VirtualTableBody<T>({ rows, columns, rowKey, children }: { rows: T[]; columns: number; rowKey: (row: T, index: number) => string | number; children: RenderRow<T> }) {
  "use no memo";
  const body = useRef<HTMLTableSectionElement>(null);
  useTableViewport(body);
  const [pinned, setPinned] = useState<string | number | null>(null);
  const pinIndex = pinned === null ? -1 : rows.findIndex((row, index) => rowKey(row, index) === pinned);
  const virtualizer = useVirtualizer<HTMLElement, HTMLTableRowElement>({
    count: rows.length,
    getScrollElement: () => body.current?.closest<HTMLElement>("[data-virtual-scroll]") || null,
    estimateSize: () => 38,
    overscan: 10,
    initialRect: { width: 1000, height: 600 },
    getItemKey: index => rowKey(rows[index], index),
    rangeExtractor: useCallback((range: Range) => {
      const visible = defaultRangeExtractor(range);
      return pinIndex < 0 || visible.includes(pinIndex) ? visible : [...visible, pinIndex].sort((a, b) => a - b);
    }, [pinIndex]),
  });
  useEffect(() => {
    const table = body.current?.closest("table");
    const viewport = table?.closest<HTMLElement>("[data-virtual-scroll]");
    if (!table || !viewport) return;
    table.setAttribute("data-virtual-sheet", "true");
    table.setAttribute("aria-rowcount", String(rows.length + 1));
    let frame = 0;
    const navigate = (event: Event) => {
      const { rowIndex, columnIndex, search } = (event as CustomEvent<{ rowIndex: number; columnIndex?: number; search?: string }>).detail;
      if (rowIndex < 0 || rowIndex >= rows.length) return;
      setPinned(rowKey(rows[rowIndex], rowIndex));
      virtualizer.scrollToIndex(rowIndex, { align: "auto" });
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const row = body.current?.querySelector<HTMLTableRowElement>(`[data-index="${rowIndex}"]`);
        if (search) {
          const cell = Array.from(row?.cells || []).find(cell => (cell.dataset.copyValue || cell.textContent || "").toLowerCase().includes(search));
          cell?.setAttribute("data-sheet-search-match", "true");
          cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
        } else {
          const cell = row?.cells[columnIndex || 0];
          cell?.click(); cell?.focus({ preventScroll: true });
        }
      });
    };
    viewport.addEventListener("sheet-navigate-cell", navigate);
    return () => { viewport.removeEventListener("sheet-navigate-cell", navigate); cancelAnimationFrame(frame); table.removeAttribute("data-virtual-sheet"); };
  }, [rows, rowKey, virtualizer]);
  const pin = (target: EventTarget) => {
    const row = (target as Element).closest<HTMLElement>("[data-index]");
    const index = Number(row?.dataset.index);
    if (row && rows[index]) setPinned(rowKey(rows[index], index));
  };
  let end = 0;
  return <tbody ref={body} onPointerDownCapture={event => pin(event.target)} onFocusCapture={event => pin(event.target)}>
    {virtualizer.getVirtualItems().map(item => {
      const gap = item.start - end; end = item.end;
      return <Fragment key={item.key}>
        {gap > 0 && <tr data-sheet-spacer aria-hidden="true"><td colSpan={columns} style={{ height: gap }}/></tr>}
        <MeasuredRow row={rows[item.index]} index={item.index} render={children as RenderRow<unknown>} measure={virtualizer.measureElement}/>
      </Fragment>;
    })}
    {virtualizer.getTotalSize() > end && <tr data-sheet-spacer aria-hidden="true"><td colSpan={columns} style={{ height: virtualizer.getTotalSize() - end }}/></tr>}
  </tbody>;
}
