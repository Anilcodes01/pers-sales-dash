"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { roles, type Role } from "@/lib/auth/roles";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "./ui/table";
import { VirtualTableBody } from "./virtual-table-body";

type Roster = { team: { id: string; name: string } | null; employees: { id: string; name: string; email: string; employeeId: string | null; roles: Role[]; lastSignInAt: string | null }[] };
export function TeamRoster() {
  const [data, setData] = useState<Roster | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    async function load() {
      try {
        const response = await fetch("/api/team-lead/team", { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load your team.");
        setData(result);
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load your team."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [revision]);
  return <Card className="people-list"><div className="panel-heading"><div><h2>{data?.team?.name || "Team"}{data?.team && !loading ? ` (${data.employees.length})` : ""}</h2><p className="csv-help">Employees assigned to your team.</p></div><Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw className={loading ? "animate-spin" : ""}/>Refresh</Button></div>
    {error ? <p role="alert">{error}</p> : <Table className="people-table"><TableHeader><TableRow><TableHead>Employee ID</TableHead><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Roles</TableHead><TableHead>Sign-in status</TableHead></TableRow></TableHeader>{loading || !data?.employees.length ? <TableBody><TableRow><TableCell colSpan={5}>{loading ? "Loading team…" : !data?.team ? "You haven’t been assigned to a team. Contact your administrator." : "No employees in this team yet."}</TableCell></TableRow></TableBody> : <VirtualTableBody rows={data.employees} columns={5} rowKey={employee => employee.id}>{employee => <TableRow key={employee.id}><TableCell>{employee.employeeId || "—"}</TableCell><TableCell>{employee.name || "—"}</TableCell><TableCell title={employee.email}>{employee.email}</TableCell><TableCell><div className="employee-role-badges">{employee.roles.map(role => <Badge key={role} variant="secondary">{roles[role]}</Badge>)}</div></TableCell><TableCell>{employee.lastSignInAt ? "Has signed in" : "Not signed in yet"}</TableCell></TableRow>}</VirtualTableBody>}</Table>}
  </Card>;
}
