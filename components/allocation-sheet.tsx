"use client";
import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import { leadColumns, type LeadValues } from "@/lib/recovery/columns";
import { PaymentLinkCell } from "./payment-link-cell";
import { RecoveryStatusBadge } from "./recovery-status-badge";
import { RecoveryCommentCell } from "./recovery-comment-cell";
import { RecoveryStatusCell } from "./recovery-status-cell";
import { selectionRange } from "@/lib/recovery/selection";
export type AllocationStudent = LeadValues & { id: string; assignedTo: string | null; comments?: string };
type Executive = { id: string; name: string; email: string };
export function AllocationSheet({ rows, executives, selected, onSelect, disabled, executive, readOnly = false, onStatusSaved, offset = 0 }: {
  rows: AllocationStudent[]; executives: Executive[]; selected: string[]; onSelect: (ids: string[]) => void;
  disabled: boolean; executive: boolean; readOnly?: boolean; offset?: number; onStatusSaved?: (id: string, field: "paymentStatus" | "leadStatus" | "comments", value: string) => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const anchor = useRef(0);
  const gesture = useRef<{ start: number; base: string[]; pointerId: number; x: number; y: number } | null>(null);
  const selectedSet = new Set(selected);
  const extend = useCallback((index: number) => {
    if (!gesture.current) return;
    onSelect(selectionRange(rows.map(row => row.id), gesture.current.start, index, gesture.current.base));
  }, [rows, onSelect]);
  const hitRow = useCallback((x: number, y: number) => {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-student-index]");
    if (row && sheet.current?.contains(row)) extend(Number(row.dataset.studentIndex));
  }, [extend]);
  useEffect(() => {
    const stop = () => { gesture.current = null; };
    // Listeners are installed before any gesture, so even a quick release is handled.
    window.addEventListener("pointerup", stop); window.addEventListener("pointercancel", stop); window.addEventListener("blur", stop);
    const timer = window.setInterval(() => {
      const drag = gesture.current;
      const scroller = sheet.current?.closest(".app-main");
      if (!drag || !scroller) return;
      const bounds = scroller.getBoundingClientRect();
      if (drag.y < bounds.top + 65) scroller.scrollBy(0, -16);
      else if (drag.y > bounds.bottom - 65) scroller.scrollBy(0, 16);
      hitRow(drag.x, Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, drag.y)));
    }, 30);
    return () => { window.clearInterval(timer); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); window.removeEventListener("blur", stop); };
  }, [hitRow]);
  function start(event: PointerEvent<HTMLTableRowElement>, index: number) {
    if (event.target instanceof Element && !event.target.closest("th:first-child")) return;
    if (readOnly || executive || disabled || event.button !== 0 || event.pointerType === "touch") return;
    event.preventDefault();
    const from = event.shiftKey ? anchor.current : index;
    if (!event.shiftKey) anchor.current = index;
    const base = event.ctrlKey || event.metaKey || event.shiftKey ? selected : [];
    gesture.current = { start: from, base, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    sheet.current?.setPointerCapture(event.pointerId);
    extend(index);
  }
  return <div className="allocation-sheet" ref={sheet} onPointerMove={event => {
    if (!gesture.current) return;
    if (!event.buttons) { gesture.current = null; return; }
    gesture.current.x = event.clientX; gesture.current.y = event.clientY;
    hitRow(event.clientX, event.clientY);
  }} onLostPointerCapture={() => { gesture.current = null; }}>
    {!executive && !readOnly && <label className="allocation-select-all"><input type="checkbox" disabled={disabled} checked={rows.length > 0 && selected.length === rows.length} onChange={event => onSelect(event.target.checked ? rows.map(row => row.id) : [])}/> Select all {rows.length} students <span role="status">{selected.length} selected</span></label>}
    <div className="allocation-sheet-scroll" tabIndex={0} role="region" aria-label="Student details spreadsheet"><table className="allocation-grid"><colgroup><col style={{ width: executive || readOnly ? 64 : 92 }}/>{!executive && <col style={{ width: 120 }}/>}{(Object.keys(leadColumns) as (keyof LeadValues)[]).map(key => <col key={key} style={{ width: key === "comments" || key === "paymentLinks" ? 240 : key === "studentEmail" || key === "studentCollegeEmail" ? 190 : key === "studentName" || key === "leadStatus" ? 150 : 120 }}/>) }</colgroup><thead><tr><th scope="col">#</th>{!executive && <th scope="col">Allocated to</th>}{Object.values(leadColumns).map(label => <th scope="col" key={label} title={label}>{label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={row.id} data-student-index={index} aria-selected={!executive && selectedSet.has(row.id)} className={selectedSet.has(row.id) ? "is-selected" : ""} onPointerDown={event => start(event, index)} onDragStart={event => event.preventDefault()}>
        <th scope="row"><span className="allocation-row-selector">{!executive && !readOnly && <input type="checkbox" aria-label={`Select row ${index + 1}: ${row.studentName || 'student'}`} disabled={disabled} checked={selectedSet.has(row.id)} onPointerDown={event => event.stopPropagation()} onChange={event => { anchor.current = index; onSelect(event.target.checked ? [...selected, row.id] : selected.filter(id => id !== row.id)); }}/>}<span>{offset + index + 1}</span></span></th>
        {!executive && <td title={row.assignedTo ? executives.find(person => person.id === row.assignedTo)?.name || "Assigned executive (unavailable)" : "Unassigned"}>{row.assignedTo ? executives.find(person => person.id === row.assignedTo)?.name || "Unavailable" : "Unassigned"}</td>}
        {(Object.keys(leadColumns) as (keyof LeadValues)[]).map(key => <td key={key} title={row[key]} data-copy-value={row[key]}>{executive && !readOnly && (key === "paymentStatus" || key === "leadStatus") ? <RecoveryStatusCell id={row.id} student={row.studentName} field={key} value={row[key]} onSaved={value => onStatusSaved?.(row.id, key, value)}/> : (key === "paymentStatus" || key === "leadStatus") ? <RecoveryStatusBadge field={key} value={row[key]}/> : key === "paymentLinks" ? <PaymentLinkCell value={row[key]}/> : key === "comments" && executive && !readOnly ? <RecoveryCommentCell id={row.id} value={row.comments || ""} student={row.studentName} onSaved={value => onStatusSaved?.(row.id, "comments", value)}/> : <span className={key === "comments" ? "recovery-comment-text" : undefined}>{row[key] || "—"}</span>}</td>)}

      </tr>)}</tbody>
    </table></div>
  </div>;
}
