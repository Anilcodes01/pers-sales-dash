"use client";
import { toast } from "sonner";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Plus, Users, Loader2 } from "lucide-react";
export type Team = { id: string; name: string; members: { userId: string }[] };
export function useTeams(revision: number) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamError, setTeamError] = useState("");
  const [teamsLoading, setTeamsLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setTeamsLoading(true); setTeamError("");
      try {
        const response = await fetch("/api/main-admin/teams", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load teams.");
        setTeams(data.teams);
      } catch (err) { if (!controller.signal.aborted) { const message = err instanceof Error ? err.message : "Unable to load teams."; setTeamError(message); toast.error(message, { id: "team-load-error" }); } }
      finally { if (!controller.signal.aborted) setTeamsLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [revision]);
  return { teams, teamError, teamsLoading };
}
export function TeamManagement() {
  const [revision, setRevision] = useState(0);
  const { teams, teamError, teamsLoading } = useTeams(revision);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); 
    const name = new FormData(event.currentTarget).get("name");
    try {
      const response = await fetch("/api/main-admin/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create team.");
      setOpen(false); toast.success(`Team “${data.team.name}” created. Assign members from Team accounts.`); setRevision(value => value + 1);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Unable to create team."); }
    finally { setBusy(false); }
  }
  return <><div className="management-toolbar"><p>Create teams, then assign members from Team accounts.</p><div><Button variant="outline" disabled={teamsLoading} onClick={() => setRevision(value => value + 1)}>Refresh</Button><Button onClick={() => {  setOpen(true); }}><Plus/> Create team</Button></div></div><div className="teams-grid">{teamsLoading ? <p>Loading teams…</p> : teams.length ? teams.map(team => <Card className="team-card" key={team.id}><Users size={20}/><h2>{team.name}</h2><p>{team.members.length} {team.members.length === 1 ? "member" : "members"}</p></Card>) : !teamError && <Card className="team-card"><p>No teams yet. Create your first team to get started.</p></Card>}</div><Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent className="management-dialog"><DialogHeader><DialogTitle>Create a team</DialogTitle><DialogDescription>Give your team a name. You can assign members afterward.</DialogDescription></DialogHeader><form className="auth-form" onSubmit={create}><label>Team name<Input name="name" required maxLength={100} placeholder="e.g. Sales North" disabled={busy}/></label><Button disabled={busy}>{busy ? <Loader2 className="animate-spin"/> : <Plus/>}{busy ? "Creating…" : "Create team"}</Button></form></DialogContent></Dialog></>;
}
