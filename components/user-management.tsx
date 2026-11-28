"use client";
import { EmployeePasswordCell } from "./employee-password-cell";
import { employeeCsv } from "@/lib/auth/employee-export";
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
import { Copy, MoreHorizontal, Pencil, ShieldOff, ShieldCheck, Trash2, Download, RefreshCw, Plus, ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "./ui/dropdown-menu";
import { useTeams } from "./team-management";

type Member = { savedPassword: string | null; roles: Role[]; restricted: boolean; employeeId: string | null; id: string; name: string; email: string; role: Role | null; createdAt: string; lastSignInAt: string | null };
export function UserManagement({ currentUserId, configured }: { currentUserId: string; configured: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<Member[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Member | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Member | null>(null);
  const [assignment, setAssignment] = useState<Member | null>(null);
  const [visible, setVisible] = useState(false);
  const { teams, teamError, teamsLoading } = useTeams(revision);
  useEffect(() => {
    if (!configured) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true); 
      try {
        const response = await fetch("/api/main-admin/users", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load accounts.");
        setUsers(data.users);
      } catch (err) { if (!controller.signal.aborted) toast.error(err instanceof Error ? err.message : "Could not load accounts."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [revision, configured]);
  const userTeam = (id: string) => teams.find(team => team.members.some(member => member.userId === id));
  const searchTerms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleUsers = users.filter(user => {
    const text = [user.name, user.email, user.employeeId, user.roles.map(role => roles[role]).join(", ") || "Unassigned", userTeam(user.id)?.name || "", user.restricted ? "restricted" : "active"].join(" ").toLowerCase();
    return searchTerms.every(term => text.includes(term));
  });
  function exportEmployees() {
    const csv = employeeCsv(visibleUsers.map(user => ({ ...user, role: user.roles.map(role => roles[role]).join(", ") || "Unassigned", team: userTeam(user.id)?.name || "" })));
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "employees.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Email copied.");
    } catch { toast.error("Could not copy email. Check clipboard permission and try again."); }
  }
  function edit(user: Member | null) { setSelected(user);  setVisible(false); setOpen(true); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const password = String(fields.get("password") || "");
    const payload = selected ? { name: fields.get("name"), email: fields.get("email"), roles: fields.getAll("roles"), ...(password ? { password } : {}) } : { name: fields.get("name"), email: fields.get("email"), roles: fields.getAll("roles"), password };
    const wasSelfReset = selected?.id === currentUserId && (Boolean(password) || String(fields.get("email") || "").trim().toLowerCase() !== selected.email.toLowerCase());
    setBusy(true);  
    try {
      const response = await fetch(selected ? `/api/main-admin/users/${selected.id}` : "/api/main-admin/users", { method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save account.");
      if (selected?.id === currentUserId && !password) router.refresh();
      setVisible(false); setOpen(false); setSelected(null);
      toast.success(wasSelfReset ? "Your login details were updated. Sign out and sign in again." : selected ? "Account updated." : "Account created. Share the credentials privately, then assign a team below.");
      setRevision(value => value + 1);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Unable to save account."); }
    finally { setBusy(false); }
  }
  async function changeAccess(employee: Member) {
    setBusy(true);
    try {
      const response = await fetch(`/api/main-admin/users/${employee.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restricted: !employee.restricted }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to change account access.");
      toast.success(employee.restricted ? "Access restored. Employee can sign in again." : "Access restricted. Existing sessions are blocked.");
      setOpen(false); setSelected(null); setRevision(value => value + 1);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Unable to change account access."); }
    finally { setBusy(false); }
  }
  async function deleteEmployee() {
    if (!deleting) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/main-admin/users/${deleting.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete employee.");
      setDeleting(null); setRevision(value => value + 1); toast.success("Employee deleted.");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Unable to delete employee."); }
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
  return <><Card className="people-list"><div className="panel-heading"><h2>Team accounts</h2><div className="management-actions"><Button asChild variant="outline"><Link href="/teams">Teams</Link></Button><Button variant="outline" size="sm" disabled={loading || busy} onClick={() => setRevision(value => value + 1)}><RefreshCw className={loading ? "animate-spin" : ""}/> Refresh</Button><Button variant="outline" disabled={loading || teamsLoading || Boolean(teamError) || !visibleUsers.length} onClick={exportEmployees}><Download/> {search.trim() ? "Export results" : "Export employees"}</Button><Button onClick={() => edit(null)}><Plus/> Create user</Button></div></div><div className="management-toolbar employee-search"><Input type="search" aria-label="Search employees" placeholder="Search name, email, employee ID, role or team…" value={search} onChange={event => setSearch(event.target.value)} /><p role="status">{loading ? "Loading employees…" : `${visibleUsers.length} of ${users.length} employees`}</p></div><Table className="people-table"><TableHeader><TableRow><TableHead>Employee ID</TableHead><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Sign-in status</TableHead><TableHead>Role</TableHead><TableHead>Team</TableHead><TableHead>Password</TableHead><TableHead>Status</TableHead><TableHead className="employee-actions-column">Actions</TableHead></TableRow></TableHeader>{loading ? <TableBody><TableRow><TableCell colSpan={9}><span className="sr-only">Loading accounts…</span><Skeleton className="h-4 w-full"/></TableCell></TableRow></TableBody> : !visibleUsers.length ? <TableBody><TableRow><TableCell colSpan={9}>{search.trim() ? "No employees match your search." : "No accounts yet."}</TableCell></TableRow></TableBody> : <VirtualTableBody rows={visibleUsers} columns={9} rowKey={user => user.id}>{user => <TableRow key={user.id}><TableCell><strong>{user.employeeId || "—"}</strong></TableCell><TableCell><strong>{user.name || "—"}</strong>{user.id === currentUserId && <span className="you-tag">You</span>}</TableCell><TableCell><div className="employee-email"><span title={user.email}>{user.email}</span><Button type="button" variant="ghost" size="icon" onClick={() => void copyEmail(user.email)} aria-label={`Copy email for ${user.name || user.email}`} title="Copy email"><Copy size={15}/></Button></div></TableCell><TableCell>{user.lastSignInAt ? "Has signed in" : "Not signed in yet"}</TableCell><TableCell><div className="employee-role-badges">{user.roles.length ? user.roles.map(role => <Badge key={role} variant="secondary">{roles[role]}</Badge>) : "Unassigned"}</div></TableCell><TableCell><Button variant="ghost" size="sm" disabled={teamsLoading || Boolean(teamError) || busy} onClick={() => {  setAssignment(user); }}>{teamsLoading ? "Loading…" : teamError ? "Unavailable" : userTeam(user.id)?.name || "Assign team"}</Button></TableCell><TableCell><EmployeePasswordCell key={`${user.id}:${revision}`} savedPassword={user.savedPassword} name={user.name || user.email}/></TableCell><TableCell><Badge variant={user.restricted ? "destructive" : "secondary"}>{user.restricted ? "Restricted" : "Active"}</Badge></TableCell><TableCell className="employee-actions-column"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={busy} aria-label={`Manage ${user.name || user.email}`}><MoreHorizontal size={18}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => edit(user)}><Pencil/>Edit employee</DropdownMenuItem><DropdownMenuItem disabled={user.id === currentUserId || user.roles.includes("main_admin")} onSelect={() => void changeAccess(user)}>{user.restricted ? <ShieldCheck/> : <ShieldOff/>}{user.restricted ? "Restore access" : "Restrict access"}</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem variant="destructive" disabled={user.id === currentUserId || user.roles.includes("main_admin")} onSelect={() => setDeleting(user)}><Trash2/>Delete employee</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>}</VirtualTableBody>}</Table></Card>
  <Dialog open={open} onOpenChange={value => { if (!busy) { setOpen(value); setVisible(false); } }}><DialogContent className="management-dialog"><DialogHeader><DialogTitle>{selected ? "Manage account" : "Create a user"}</DialogTitle><DialogDescription>{selected ? selected.email : "Set their credentials and role. No verification email is required."}</DialogDescription></DialogHeader><form className="auth-form" onSubmit={save} key={selected?.id || "new"}>
    <label>Full name<Input name="name" required maxLength={100} defaultValue={selected?.name || ""} autoComplete="name" placeholder="e.g. Ankit Sharma" disabled={busy}/></label>
    <label>Work email<Input name="email" type="email" required autoComplete="off" maxLength={254} placeholder="member@company.com" defaultValue={selected?.email || ""} disabled={busy}/></label>
    <fieldset className="employee-role-options" disabled={busy}><legend>Roles</legend><p className="editor-note">Select every workspace this employee needs.</p>{Object.entries(roles).map(([value, label]) => <label key={value}><input type="checkbox" name="roles" value={value} defaultChecked={selected ? selected.roles.includes(value as Role) : value === "sales_executive"} disabled={value === "main_admin" && Boolean(selected?.roles.includes("main_admin"))}/>{label}</label>)}{selected?.roles.includes("main_admin") && <input type="hidden" name="roles" value="main_admin"/>}</fieldset>
    <label>{selected ? "New password (optional)" : "Initial password"}<span className="password-wrap"><Input name="password" type={visible ? "text" : "password"} required={!selected} minLength={6} maxLength={128} autoComplete="new-password" placeholder="At least 6 characters" disabled={busy}/><Button variant="ghost" size="icon" type="button" disabled={busy} aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={16}/> : <Eye size={16}/>}</Button></span></label>
    <p className="editor-note">Share the password privately. Main admins can reveal saved passwords from the employee table.</p><Button disabled={busy}>{busy ? <Loader2 className="animate-spin"/> : <Plus/>}{busy ? "Saving…" : selected ? "Save changes" : "Create user"}</Button></form></DialogContent></Dialog>
  <Dialog open={Boolean(deleting)} onOpenChange={value => { if (!busy && !value) setDeleting(null); }}><DialogContent className="management-dialog"><DialogHeader><DialogTitle>Delete employee?</DialogTitle><DialogDescription>Delete {deleting?.name || deleting?.email} and their login account permanently. Their team membership will be removed. If they have linked sales or recovery records, deletion will be blocked; restrict access instead.</DialogDescription></DialogHeader><div className="management-actions"><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={deleteEmployee}>{busy ? "Deleting…" : "Delete employee"}</Button></div></DialogContent></Dialog>
  <Dialog open={Boolean(assignment)} onOpenChange={value => { if (!busy && !value) setAssignment(null); }}><DialogContent className="management-dialog"><DialogHeader><DialogTitle>Assign team</DialogTitle><DialogDescription>{assignment?.email}</DialogDescription></DialogHeader><form className="auth-form" onSubmit={saveTeam}><label>Team<Select name="teamId" defaultValue={assignment ? userTeam(assignment.id)?.id || "__none" : "__none"} disabled={busy}><SelectTrigger aria-label="Team"><SelectValue placeholder="Choose a team"/></SelectTrigger><SelectContent><SelectItem value="__none">No team</SelectItem>{teams.map(team => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}</SelectContent></Select></label>{!teams.length && <p className="editor-note">Create a team on the Teams page first.</p>}<Button disabled={busy}>{busy ? <Loader2 className="animate-spin"/> : <ArrowRight/>} Save assignment</Button></form></DialogContent></Dialog></>;
}
