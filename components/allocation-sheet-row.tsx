"use client";
import { memo, type PointerEvent } from "react";
import type { AllocationStudent } from "./allocation-sheet";
import { leadColumns, type LeadValues } from "@/lib/recovery/columns";
import { RecoveryAmountCell } from "./recovery-amount-cell";
import { RecoveryPaymentLinkEditor } from "./recovery-payment-link-editor";
import { PaymentLinkCell } from "./payment-link-cell";
import { RecoveryStatusBadge } from "./recovery-status-badge";
import { RecoveryCommentCell } from "./recovery-comment-cell";
import { RecoveryStatusCell } from "./recovery-status-cell";
export type SheetCellField = "paymentStatus" | "leadStatus" | "comments" | "remainingAmount" | "paymentLinks";
export const AllocationSheetRow = memo(function AllocationSheetRow({ row, index, offset, selected, executive, readOnly, adminEditable, disabled, allocatedName, onStart, onChecked, onSaved, measure }: {
  row: AllocationStudent; index: number; offset: number; selected: boolean; executive: boolean;
  readOnly: boolean; adminEditable: boolean; disabled: boolean; allocatedName: string;
  onStart: (event: PointerEvent<HTMLTableRowElement>, index: number) => void;
  onChecked: (index: number, checked: boolean) => void;
  onSaved: (id: string, field: SheetCellField, value: string) => void;
  measure?: (node: HTMLTableRowElement | null) => void;
}) {
  return (
              <tr
                ref={measure}
                data-index={index}
                data-sheet-row-id={row.id}
                aria-rowindex={index + 2}
                data-student-index={index}
                aria-selected={!executive && selected}
                className={selected ? "is-selected" : ""}
                onPointerDown={(event) => onStart(event, index)}
                onDragStart={(event) => event.preventDefault()}
              >
                <th scope="row">
                  <span className="allocation-row-selector">
                    {!executive && !readOnly && (
                      <input
                        type="checkbox"
                        aria-label={`Select row ${index + 1}: ${row.studentName || "student"}`}
                        disabled={disabled}
                        checked={selected}
                        onPointerDown={(event) => event.stopPropagation()}
                        onChange={event => onChecked(index, event.target.checked)}
                      />
                    )}
                    <span>{offset + index + 1}</span>
                  </span>
                </th>
                {!executive && <td title={allocatedName}>{allocatedName}</td>}
                {(Object.keys(leadColumns) as (keyof LeadValues)[]).map(
                  (key) => (
                    <td key={key} title={row[key]} data-copy-value={row[key]}>
                      {(adminEditable || (executive && !readOnly)) &&
                      (key === "paymentStatus" || key === "leadStatus") ? (
                        <RecoveryStatusCell
                          admin={adminEditable}
                          id={row.id}
                          student={row.studentName}
                          field={key}
                          value={row[key]}
                          onSaved={(value, changes) => {
                            onSaved?.(row.id, key, value);
                            if (key === "leadStatus" && changes?.paymentStatus)
                              onSaved?.(
                                row.id,
                                "paymentStatus",
                                changes.paymentStatus,
                              );
                          }}
                        />
                      ) : key === "paymentStatus" || key === "leadStatus" ? (
                        <RecoveryStatusBadge field={key} value={row[key]} />
                      ) : key === "paymentLinks" && adminEditable ? <RecoveryPaymentLinkEditor id={row.id} value={row[key]} onSaved={value => onSaved?.(row.id, "paymentLinks", value)}/> : key === "remainingAmount" && executive && !readOnly && row.paymentStatus.trim().toLowerCase() !== "paid" && ["discount", "pay in instalments"].includes(row.leadStatus.trim().toLowerCase()) ? <RecoveryAmountCell id={row.id} value={row[key]} onSaved={(amount, link, paymentStatus) => { onSaved?.(row.id, "remainingAmount", amount); onSaved?.(row.id, "paymentLinks", link); if (paymentStatus) onSaved?.(row.id, "paymentStatus", paymentStatus); }}/> : key === "paymentLinks" ? (
                        <PaymentLinkCell value={row[key]} />
                      ) : key === "comments" && executive && !readOnly ? (
                        <RecoveryCommentCell
                          id={row.id}
                          value={row.comments || ""}
                          student={row.studentName}
                          onSaved={(value) =>
                            onSaved?.(row.id, "comments", value)
                          }
                        />
                      ) : (
                        <span
                          className={
                            key === "comments"
                              ? "recovery-comment-text"
                              : undefined
                          }
                        >
                          {row[key] || "—"}
                        </span>
                      )}
                    </td>
                  ),
                )}
              </tr>
  );
});
