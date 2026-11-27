"use client";
import { VirtualTableBody } from "./virtual-table-body";
import { toast } from "sonner";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { roles, type Role } from "@/lib/auth/roles";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./ui/table";
import { Skeleton } from "./ui/skeleton";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { RefreshCw, Plus, ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import { useTeams } from "./team-management";

type Member = { id: string; name: string; email: string; role: Role | null; createdAt: string; lastSignInAt: string | null };
export function UserManagement({ currentUserId, configured }: { currentUserId: string; configured: boolean }) {
  const router = useRouter();
  const [users, setUsers] = useState<Member[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Member | null>(null);
  const [open, setOpen] = useState(false);
  const [assignment, setAssignment] = useState<Member | null>(null);
  const [visible, setVisible] = useState(false);
  const { teams, teamError, teamsLoading } = useTeams(revision);
  useEffect(() => {
    if (!configured) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true); 
      try {
        const response = await fetch(`/api/main-admin/users?page=${page}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load accounts.");
        setUsers(data.users); setHasMore(data.hasMore);
      } catch (err) { if (!controller.signal.aborted) toast.error(err instanceof Error ? err.message : "Could not load accounts."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [page, revision, configured]);
  const userTeam = (id: string) => teams.find(team => team.members.some(member => member.userId === id));
  function edit(user: Member | null) { setSelected(user);  setVisible(false); setOpen(true); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const password = String(fields.get("password") || "");
    const payload = selected ? { name: fields.get("name"), role: fields.get("role"), ...(password ? { password } : {}) } : { name: fields.get("name"), email: fields.get("email"), role: fields.get("role"), password };
    const wasSelfReset = selected?.id === currentUserId && Boolean(password);
    setBusy(true);  
    try {
      const response = await fetch(selected ? `/api/main-admin/users/${selected.id}` : "/api/main-admin/users", { method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save account.");
      if (selected?.id === currentUserId && !password) router.refresh();
      setVisible(false); setOpen(false); setSelected(null);
      toast.success(wasSelfReset ? "Your password was reset. Sign out and sign in with the new password." : selected ? "Account updated." : "Account created. Share the credentials privately, then assign a team below.");
      setPage(1); setRevision(value => value + 1);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Unable to save account."); }
    finally { setBusy(false); }
  }
  async function saveTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!assignment) return;
    const choice = new FormData(event.currentTarget).get("teamId");
    const teamId = choice === "__none" ? null : choice;
    setBusy(true); 
    try {
      const response = await fetch(`/api/main-admin/users/${assignment.id}/team`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to assign team.");
      setAssignment(null); toast.success(teamId ? "Team assignment saved." : "User removed from their team."); setRevision(value => value + 1);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Unable to assign team."); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (!configured) toast.error("Account administration needs to be configured by your administrator.", { id: "admin-config" }); }, [configured]);
  if (!configured) return null;
  return <><Card className="people-list"><div className="panel-heading"><h2>Team accounts</h2><div className="management-actions"><Button asChild variant="outline"><Link href="/teams">Teams</Link></Button><Button variant="outline" size="sm" disabled={loading || busy} onClick={() => setRevision(value => value + 1)}><RefreshCw className={loading ? "animate-spin" : ""}/> Refresh</Button><Button onClick={() => edit(null)}><Plus/> Create user</Button></div></div><Table className="people-table"><TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Role</TableHead><TableHead>Team</TableHead><TableHead>Access</TableHead></TableRow></TableHeader>{loading ? <TableBody> <TableRow><TableCell colSpan={4}><span className="sr-only">Loading accounts…</span><Skeleton className="h-4 w-full"/></TableCell></TableRow></TableBody> : !users.length ? <TableBody><TableRow><TableCell colSpan={4}>No accounts on this page.</TableCell></TableRow></TableBody> : <VirtualTableBody rows={users} columns={4} rowKey={user => user.id}>{user => <TableRow key={user.id}><TableCell><strong>{user.name || user.email}</strong>{user.name && <small>{user.email}</small>}{user.id === currentUserId && <span className="you-tag">You</span>}<small>{user.lastSignInAt ? "Has signed in" : "Not signed in yet"}</small></TableCell><TableCell><Badge variant="secondary">{user.role ? roles[user.role] : "Unassigned"}</Badge></TableCell><TableCell><Button variant="ghost" size="sm" disabled={teamsLoading || Boolean(teamError) || busy} onClick={() => {  setAssignment(user); }}>{teamsLoading ? "Loading…" : teamError ? "Unavailable" : userTeam(user.id)?.name || "Assign team"}</Button></TableCell><TableCell><Button variant="ghost" size="sm" onClick={() => edit(user)}>Manage <ArrowRight size={13}/></Button></TableCell></TableRow>}</VirtualTableBody>}</Table><div className="pagination"><Button disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>← Previous</Button><span>Page {page}</span><Button disabled={!hasMore || loading} onClick={() => setPage(value => value + 1)}>Next →</Button></div></Card>
  <Dialog open={open} onOpenChange={value => { if (!busy) { setOpen(value); setVisible(false); } }}><DialogContent className="management-dialog"><DialogHeader><DialogTitle>{selected ? "Manage account" : "Create a user"}</DialogTitle><DialogDescription>{selected ? selected.email : "Set their credentials and role. No verification email is required."}</DialogDescription></DialogHeader><form className="auth-form" onSubmit={save} key={selected?.id || "new"}>
    <label>Full name<Input name="name" required maxLength={100} defaultValue={selected?.name || ""} autoComplete="name" placeholder="e.g. Ankit Sharma" disabled={busy}/></label>
    {!selected && <label>Work email<Input name="email" type="email" required autoComplete="off" maxLength={254} placeholder="member@company.com" disabled={busy}/></label>}
    <label>Role<Select name="role" defaultValue={selected?.role || "sales_executive"} required disabled={busy || selected?.role === "main_admin"}><SelectTrigger aria-label="Role"><SelectValue placeholder="Choose a role"/></SelectTrigger><SelectContent>{Object.entries(roles).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>{selected?.role === "main_admin" && <input type="hidden" name="role" value="main_admin"/>}</label>
    <label>{selected ? "New password (optional)" : "Initial password"}<span className="password-wrap"><Input name="password" type={visible ? "text" : "password"} required={!selected} minLength={6} maxLength={128} autoComplete="new-password" placeholder="At least 6 characters" disabled={busy}/><Button variant="ghost" size="icon" type="button" disabled={busy} aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={16}/> : <Eye size={16}/>}</Button></span></label>
    <p className="editor-note">Share the password privately. You can reset it later, but can’t retrieve it.</p><Button disabled={busy}>{busy ? <Loader2 className="animate-spin"/> : <Plus/>}{busy ? "Saving…" : selected ? "Save changes" : "Create user"}</Button></form></DialogContent></Dialog>
  <Dialog open={Boolean(assignment)} onOpenChange={value => { if (!busy && !value) setAssignment(null); }}><DialogContent className="management-dialog"><DialogHeader><DialogTitle>Assign team</DialogTitle><DialogDescription>{assignment?.email}</DialogDescription></DialogHeader><form className="auth-form" onSubmit={saveTeam}><label>Team<Select name="teamId" defaultValue={assignment ? userTeam(assignment.id)?.id || "__none" : "__none"} disabled={busy}><SelectTrigger aria-label="Team"><SelectValue placeholder="Choose a team"/></SelectTrigger><SelectContent><SelectItem value="__none">No team</SelectItem>{teams.map(team => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}</SelectContent></Select></label>{!teams.length && <p className="editor-note">Create a team on the Teams page first.</p>}<Button disabled={busy}>{busy ? <Loader2 className="animate-spin"/> : <ArrowRight/>} Save assignment</Button></form></DialogContent></Dialog></>;
}
