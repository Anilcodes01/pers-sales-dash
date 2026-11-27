"use client";
import { notifyRecoveryEdit } from "@/lib/recovery/client-edit-version";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { PaymentLinkCell } from "./payment-link-cell";
export function RecoveryPaymentLinkEditor({ id, value, onSaved }: { id: string; value: string; onSaved: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/recovery-admin/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentLinks: draft }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update payment link.");
      notifyRecoveryEdit();
      onSaved(data.paymentLinks); setEditing(false); toast.success("Payment link updated.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update payment link."); }
    finally { setSaving(false); }
  }
  return editing ? <form className="remaining-amount-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
    <input type="url" aria-label="Payment link URL" placeholder="https://…" maxLength={2048} value={draft} disabled={saving} autoFocus onChange={event => setDraft(event.target.value)}/>
    <Button type="submit" disabled={saving || draft.trim() === value}>{saving ? "Saving…" : "Save"}</Button>
    <Button type="button" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
    {saving && <span className="status-saving" role="status">Saving…</span>}
  </form> : <div className="sheet-comment-cell"><PaymentLinkCell value={value}/><button type="button" className="recovery-comment-button sheet-comment-edit" data-copy-ignore aria-label="Edit payment link" onClick={() => { setDraft(value); setEditing(true); }}><Pencil size={14}/></button></div>;
}
