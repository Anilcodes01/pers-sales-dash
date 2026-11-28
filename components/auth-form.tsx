"use client";
import Link from "next/link";
import { toast } from "sonner";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, Eye, EyeOff, Loader2, LogOut } from "lucide-react";

export function AuthForm({ configured }: { configured: boolean }) {
  useEffect(() => { if (!configured) toast.error("Authentication setup is pending. Ask your administrator to complete setup.", { id: "auth-config" }); }, [configured]);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
     setBusy(true);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: fields.get("email"), password: fields.get("password") }) });
      const result = await response.json();
      if (!response.ok) { toast.error(result.error || "Unable to sign in. Please retry."); return; }
      router.replace(result.redirect); router.refresh();
    } catch { toast.error("Unable to connect. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="auth-form">

    <label>Work email<Input name="email" type="email" autoComplete="username" placeholder="you@company.com" required maxLength={254} disabled={busy}/></label>
    <label>Password<span className="password-wrap"><Input name="password" type={visible ? "text" : "password"} autoComplete="current-password" required maxLength={128} placeholder="Enter your password" disabled={busy}/><Button variant="ghost" size="icon" type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={16}/> : <Eye size={16}/>}</Button></span></label>
    
    <Button className="full" disabled={busy || !configured}>{busy ? <><Loader2 className="animate-spin"/> Signing in…</> : <>Sign in <ArrowRight/></>}</Button>
    <Separator/>
    <p className="form-foot">Need an account or a password reset?<br/>Contact your main administrator.<br/><Link href="/team-lead/register">Team lead registration</Link></p>
  </form>;
}

export function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <><Button variant="ghost" disabled={busy} onClick={async () => {
    setBusy(true); 
    try { const response = await fetch("/api/auth/logout", { method: "POST" }); if (!response.ok) throw new Error(); router.replace("/login"); router.refresh(); }
    catch { toast.error("Could not sign out. Please retry."); setBusy(false); }
  }}>{busy ? <Loader2 className="animate-spin"/> : <LogOut size={15}/>} {busy ? "Signing out…" : "Sign out"}</Button></>;
}
