"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
  type PointerEvent,
} from "react";
import {
  useVirtualizer,
  defaultRangeExtractor,
  type Range,
} from "@tanstack/react-virtual";
import { useTableViewport } from "./use-table-viewport";
import { AllocationSheetRow } from "./allocation-sheet-row";
import { SheetFind } from "./sheet-find";
import { leadColumns, type LeadValues } from "@/lib/recovery/columns";
import { selectionRange } from "@/lib/recovery/selection";
export type AllocationStudent = LeadValues & {
  id: string;
  assignedTo: string | null;
  comments?: string;
};
type Executive = { id: string; name: string; email: string };
export function AllocationSheet({
  rows,
  executives,
  selected,
  onSelect,
  disabled,
  executive,
  readOnly = false,
  adminEditable = false,
  virtualized = true,
  fillViewport = true,
  searchable = true,
  onStatusSaved,
  offset = 0,
}: {
  rows: AllocationStudent[];
  executives: Executive[];
  selected: string[];
  onSelect: (ids: string[]) => void;
  disabled: boolean;
  executive: boolean;
  readOnly?: boolean;
  adminEditable?: boolean;
  virtualized?: boolean;
  fillViewport?: boolean;
  searchable?: boolean;
  offset?: number;
  onStatusSaved?: (
    id: string,
    field:
      | "paymentStatus"
      | "leadStatus"
      | "comments"
      | "remainingAmount"
      | "paymentLinks",
    value: string,
  ) => void;
}) {
  "use no memo"; // TanStack Virtual owns mutable viewport measurements.
  const sheet = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  useTableViewport(scroll, virtualized && fillViewport);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const pinIndex = pinnedId ? rows.findIndex((row) => row.id === pinnedId) : -1;
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: virtualized ? rows.length : 0,
    getScrollElement: () => scroll.current,
    estimateSize: () => 38,
    overscan: 10,
    initialRect: { width: 1000, height: 600 },
    getItemKey: (index) => rows[index].id,
    rangeExtractor: useCallback(
      (range: Range) => {
        const indices = defaultRangeExtractor(range);
        return pinIndex < 0 || indices.includes(pinIndex)
          ? indices
          : [...indices, pinIndex].sort((a, b) => a - b);
      },
      [pinIndex],
    ),
    enabled: virtualized,
  });
  const names = useMemo(
    () => new Map(executives.map((person) => [person.id, person.name])),
    [executives],
  );
  const anchor = useRef(0);
  const gesture = useRef<{
    start: number;
    base: string[];
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const selectedSet = new Set(selected);
  const extend = useCallback(
    (index: number) => {
      if (!gesture.current) return;
      onSelect(
        selectionRange(
          rows.map((row) => row.id),
          gesture.current.start,
          index,
          gesture.current.base,
        ),
      );
    },
    [rows, onSelect],
  );
  const hitRow = useCallback(
    (x: number, y: number) => {
      const row = document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>("[data-student-index]");
      if (row && sheet.current?.contains(row))
        extend(Number(row.dataset.studentIndex));
    },
    [extend],
  );
  useEffect(() => {
    const stop = () => {
      gesture.current = null;
    };
    // Listeners are installed before any gesture, so even a quick release is handled.
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    const timer = window.setInterval(() => {
      const drag = gesture.current;
      const scroller = virtualized
        ? scroll.current
        : sheet.current?.closest(".app-main");
      if (!drag || !scroller) return;
      const bounds = scroller.getBoundingClientRect();
      if (drag.y < bounds.top + 65) scroller.scrollBy(0, -16);
      else if (drag.y > bounds.bottom - 65) scroller.scrollBy(0, 16);
      hitRow(
        drag.x,
        Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, drag.y)),
      );
    }, 30);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
    };
  }, [hitRow, virtualized]);
  function start(event: PointerEvent<HTMLTableRowElement>, index: number) {
    if (
      event.target instanceof Element &&
      !event.target.closest("th:first-child")
    )
      return;
    if (
      readOnly ||
      executive ||
      disabled ||
      event.button !== 0 ||
      event.pointerType === "touch"
    )
      return;
    event.preventDefault();
    const from = event.shiftKey ? anchor.current : index;
    if (!event.shiftKey) anchor.current = index;
    const base =
      event.ctrlKey || event.metaKey || event.shiftKey ? selected : [];
    gesture.current = {
      start: from,
      base,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    sheet.current?.setPointerCapture(event.pointerId);
    extend(index);
  }
  const handlers = useRef({ start, onSelect, onStatusSaved, rows, selected });
  useLayoutEffect(() => {
    handlers.current = { start, onSelect, onStatusSaved, rows, selected };
  });
  const forwardStart = useCallback(
    (event: PointerEvent<HTMLTableRowElement>, index: number) =>
      handlers.current.start(event, index),
    [],
  );
  const forwardCheck = useCallback((index: number, checked: boolean) => {
    anchor.current = index;
    const current = handlers.current;
    const id = current.rows[index].id;
    current.onSelect(
      checked
        ? [...current.selected, id]
        : current.selected.filter((value) => value !== id),
    );
  }, []);
  const forwardSave = useCallback(
    (
      id: string,
      field:
        | "paymentStatus"
        | "leadStatus"
        | "comments"
        | "remainingAmount"
        | "paymentLinks",
      value: string,
    ) => handlers.current.onStatusSaved?.(id, field, value),
    [],
  );
  useEffect(() => {
    const element = scroll.current;
    if (!virtualized || !element) return;
    let frame = 0;
    function navigate(event: Event) {
      const { rowIndex, columnIndex, search } = (
        event as CustomEvent<{ rowIndex: number; columnIndex: number; search?: string }>
      ).detail;
      if (rowIndex < 0 || rowIndex >= rows.length) return;
      setPinnedId(rows[rowIndex].id);
      virtualizer.scrollToIndex(rowIndex, { align: "auto" });
      frame = requestAnimationFrame(() => {
        const row = element?.querySelector<HTMLTableRowElement>(
          `tr[data-student-index="${rowIndex}"]`,
        );
        if (search) {
          const cell = Array.from(row?.querySelectorAll<HTMLElement>("td") || []).find(cell => (cell.dataset.copyValue || cell.textContent || "").toLowerCase().includes(search));
          cell?.setAttribute("data-sheet-search-match", "true");
          cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
          return;
        }
        const cell = row?.cells[columnIndex];
        cell?.click();
        cell?.focus({ preventScroll: true });
      });
    }
    element.addEventListener("sheet-navigate-cell", navigate);
    return () => {
      element.removeEventListener("sheet-navigate-cell", navigate);
      cancelAnimationFrame(frame);
    };
  }, [rows, virtualized, virtualizer]);
  function pin(event: React.SyntheticEvent) {
    const row = (event.target as Element).closest<HTMLElement>(
      "[data-student-index]",
    );
    if (row) setPinnedId(rows[Number(row.dataset.studentIndex)]?.id || null);
  }
  const columnCount = Object.keys(leadColumns).length + (executive ? 1 : 2);
  const renderRow = (
    index: number,
    measure?: (node: HTMLTableRowElement | null) => void,
  ) => {
    const row = rows[index];
    return (
      <AllocationSheetRow
        key={row.id}
        row={row}
        index={index}
        offset={offset}
        selected={selectedSet.has(row.id)}
        executive={executive}
        readOnly={readOnly}
        adminEditable={adminEditable}
        disabled={disabled}
        allocatedName={
          row.assignedTo
            ? names.get(row.assignedTo) || "Unavailable"
            : "Unassigned"
        }
        onStart={forwardStart}
        onChecked={forwardCheck}
        onSaved={forwardSave}
        measure={measure}
      />
    );
  };
  let end = 0;
  const items = virtualized ? virtualizer.getVirtualItems() : [];
  const renderedRows = virtualized ? (
    <>
      {items.map((item) => {
        const gap = item.start - end;
        end = item.end;
        return (
          <Fragment key={item.key}>
            {gap > 0 && (
              <tr data-sheet-spacer aria-hidden="true">
                <td colSpan={columnCount} style={{ height: gap }} />
              </tr>
            )}
            {renderRow(item.index, virtualizer.measureElement)}
          </Fragment>
        );
      })}
      {virtualizer.getTotalSize() > end && (
        <tr data-sheet-spacer aria-hidden="true">
          <td
            colSpan={columnCount}
            style={{ height: virtualizer.getTotalSize() - end }}
          />
        </tr>
      )}
    </>
  ) : (
    rows.map((_, index) => renderRow(index))
  );
  return (
    <div
      className="allocation-sheet"
      ref={sheet}
      onPointerMove={(event) => {
        if (!gesture.current) return;
        if (!event.buttons) {
          gesture.current = null;
          return;
        }
        gesture.current.x = event.clientX;
        gesture.current.y = event.clientY;
        hitRow(event.clientX, event.clientY);
      }}
      onLostPointerCapture={() => {
        gesture.current = null;
      }}
    >
      {searchable && <SheetFind rows={rows} root={sheet}/>}
      {!executive && !readOnly && (
        <label className="allocation-select-all">
          <input
            type="checkbox"
            disabled={disabled}
            checked={rows.length > 0 && selected.length === rows.length}
            onChange={(event) =>
              onSelect(event.target.checked ? rows.map((row) => row.id) : [])
            }
          />{" "}
          Select all {rows.length} students{" "}
          <span role="status">{selected.length} selected</span>
        </label>
      )}
      <div
        ref={scroll}
        onClickCapture={virtualized ? pin : undefined}
        onFocusCapture={virtualized ? pin : undefined}
        className={`allocation-sheet-scroll${virtualized ? " is-virtual" : ""}`}
        tabIndex={0}
        role="region"
        aria-label="Student details spreadsheet"
      >
        <table
          className="allocation-grid"
          data-virtual-sheet={virtualized || undefined}
          aria-rowcount={rows.length + 1}
        >
          <colgroup>
            <col style={{ width: executive || readOnly ? 64 : 92 }} />
            {!executive && <col style={{ width: 120 }} />}
            {(Object.keys(leadColumns) as (keyof LeadValues)[]).map((key) => (
              <col
                key={key}
                style={{
                  width:
                    key === "comments" || key === "paymentLinks"
                      ? 240
                      : key === "studentEmail" || key === "studentCollegeEmail"
                        ? 190
                        : key === "studentName" || key === "leadStatus"
                          ? 150
                          : 120,
                }}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">#</th>
              {!executive && <th scope="col">Allocated to</th>}
              {Object.values(leadColumns).map((label) => (
                <th scope="col" key={label} title={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{renderedRows}</tbody>
        </table>
      </div>
    </div>
  );
}
