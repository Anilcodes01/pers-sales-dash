"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";

type TeamOption = { id: string; name: string };
export function TeamRegistrationForm({ kind, teams, team }: { kind: "team-lead" | "employee"; teams?: TeamOption[]; team?: TeamOption }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch(`/api/register/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: fields.get("name"), email: fields.get("email"), password: fields.get("password"), teamId: team?.id || fields.get("teamId") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Registration failed.");
      toast.success(result.redirect === "/login" ? "Account created. Please sign in." : "Welcome! Your account is ready.");
      router.replace(result.redirect); router.refresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Unable to register. Please try again."); }
    finally { setBusy(false); }
  }
  return <form className="auth-form" onSubmit={submit}>
    <label>Full name<Input name="name" required maxLength={100} autoComplete="name" disabled={busy}/></label>
    <label>Email<Input name="email" type="email" required maxLength={254} autoComplete="username" disabled={busy}/></label>
    {kind === "team-lead" && <label>Team<Select name="teamId" required disabled={busy}><SelectTrigger aria-label="Team"><SelectValue placeholder="Select your team"/></SelectTrigger><SelectContent>{teams?.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></label>}
    <label>Password<span className="password-wrap"><Input name="password" type={visible ? "text" : "password"} minLength={6} maxLength={128} required autoComplete="new-password" placeholder="At least 6 characters" disabled={busy}/><Button type="button" variant="ghost" size="icon" onClick={() => setVisible(value => !value)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff/> : <Eye/>}</Button></span></label>
    <Button disabled={busy || (kind === "team-lead" && !teams?.length)}>{busy ? <><Loader2 className="animate-spin"/> Registering…</> : "Register"}</Button>
    {kind === "team-lead" && !teams?.length && <p>No teams are available. Contact your administrator.</p>}
    <p className="form-foot">Already registered? <Link href="/login">Sign in</Link></p>
  </form>;
}
