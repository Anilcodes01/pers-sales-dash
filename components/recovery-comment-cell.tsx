"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
export function RecoveryCommentCell({ id, value, student, onSaved }: { id: string; value: string; student: string; onSaved: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/recovery-executive/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comments: draft }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save comments.");
      onSaved(data.comments); setEditing(false); toast.success("Comments saved.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save comments."); }
    finally { setSaving(false); }
  }
  return editing ? <form className="custom-status-form" onSubmit={event => { event.preventDefault(); void save(); }}><textarea aria-label={`Comments for ${student || "student"}`} value={draft} maxLength={5000} rows={3} autoFocus disabled={saving} onChange={event => setDraft(event.target.value)}/><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button><Button type="button" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button></form> : <button type="button" className="recovery-comment-button" aria-label={`Edit comments for ${student || "student"}`} onClick={() => { setDraft(value); setEditing(true); }}>{value || "Add comment…"}</button>;
}
