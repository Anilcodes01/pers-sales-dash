"use client";
import { notifyRecoveryEdit } from "@/lib/recovery/client-edit-version";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
export function RecoveryAmountCell({ id, value, onSaved }: { id: string; value: string; onSaved: (remainingAmount: string, paymentLinks: string, paymentStatus?: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pendingAmount, setPendingAmount] = useState<string | null>(null);
  async function save() {
    setSaving(true); setError(""); setPendingAmount(null);
    try {
      const response = await fetch(`/api/recovery-executive/leads/${id}/payment-link`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ remainingAmount: draft }) });
      const data = await response.json();
      if (!response.ok) {
        if (typeof data.pendingAmount === "string") setPendingAmount(data.pendingAmount);
        throw new Error(data.error || "Could not replace the payment link.");
      }
      notifyRecoveryEdit();
      onSaved(data.remainingAmount, data.paymentLinks, data.paymentStatus);
      setEditing(false); toast.success(data.reconciled ? "Razorpay confirms this payment is complete. Student marked Paid; amount unchanged." : "Amount and payment link updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update payment link.";
      setError(message); toast.error(message);
    } finally { setSaving(false); }
  }
  return editing ? <form className="remaining-amount-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
    <input aria-label="Amount to collect" inputMode="decimal" value={draft} disabled={saving} autoFocus onChange={event => setDraft(event.target.value)}/>
    <Button type="submit" disabled={saving || !draft.trim() || draft.trim() === value}>{saving ? "Updating link…" : "Save"}</Button>
    <Button type="button" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
    {saving && <span className="status-saving" role="status">Replacing payment link…</span>}
    {pendingAmount && <Button type="button" variant="outline" disabled={saving} onClick={() => setDraft(pendingAmount)}>Use pending ₹{pendingAmount}</Button>}
    {error && <span role="alert">{error}</span>}
  </form> : <div className="sheet-comment-cell"><span>{value || "—"}</span><button type="button" className="recovery-comment-button sheet-comment-edit" data-copy-ignore aria-label="Edit amount and replace payment link" title="Edit amount and replace payment link" onClick={() => { setDraft(value); setError(""); setEditing(true); }}><Pencil size={14}/></button></div>;
}
