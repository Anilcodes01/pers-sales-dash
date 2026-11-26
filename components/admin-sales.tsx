"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "./ui/select";
import { RowsTable, type Row } from "./sales-imports";
type Options = { people: { id: string; name: string; email: string }[]; teams: { id: string; name: string; members: { userId: string }[] }[]; months: string[] };
function monthLabel(value: string) { return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T00:00:00Z`)); }
export function AdminSales() {
  const [options, setOptions] = useState<Options>({ people: [], teams: [], months: [] });
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [team, setTeam] = useState("all");
  const [owner, setOwner] = useState("all");
  const [month, setMonth] = useState("all");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [records, setRecords] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setOptionsLoading(true);
      try {
        const response = await fetch("/api/main-admin/sales/options", { cache: "no-store", signal: controller.signal });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load filters."); setOptions(data);
      } catch (error) { if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : "Could not load filters.", { id: "admin-sales-options" }); }
      finally { if (!controller.signal.aborted) setOptionsLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setFailed(false);
      const params = new URLSearchParams({ page: String(page) });
      if (team !== "all") params.set("teamId", team); if (owner !== "all") params.set("ownerId", owner); if (month !== "all") params.set("month", month);
      try {
        const response = await fetch(`/api/main-admin/sales?${params}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load sales.");
        setRecords(data.records); setTotal(data.total); setHasMore(data.hasMore);
      } catch (error) { if (!controller.signal.aborted) { setFailed(true); toast.error(error instanceof Error ? error.message : "Could not load sales.", { id: "admin-sales-list" }); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [team, owner, month, page, revision]);
  const people = options.people.filter(person => team === "all" || (team === "unassigned" ? !options.teams.some(group => group.members.some(member => member.userId === person.id)) : options.teams.find(group => group.id === team)?.members.some(member => member.userId === person.id)));
  return <><Card className="csv-upload-card"><div className="admin-sales-filters auth-form"><label>Team<Select value={team} onValueChange={value => { setTeam(value); setOwner("all"); setPage(1); }} disabled={optionsLoading}><SelectTrigger aria-label="Filter by team"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All teams</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem>{options.teams.map(group => <SelectItem value={group.id} key={group.id}>{group.name}</SelectItem>)}</SelectContent></Select></label><label>Salesperson<Select value={owner} onValueChange={value => { setOwner(value); setPage(1); }} disabled={optionsLoading}><SelectTrigger aria-label="Filter by sales executive"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All salespeople</SelectItem>{people.map(person => <SelectItem value={person.id} key={person.id}>{person.name || person.email}</SelectItem>)}</SelectContent></Select></label><label>Reporting month<Select value={month} onValueChange={value => { setMonth(value); setPage(1); }} disabled={optionsLoading}><SelectTrigger aria-label="Filter by reporting month"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All months</SelectItem>{options.months.map(period => <SelectItem value={period} key={period}>{monthLabel(period)}</SelectItem>)}</SelectContent></Select></label><Button variant="outline" onClick={() => { setTeam("all"); setOwner("all"); setMonth("all"); setPage(1); }}>Clear filters</Button></div><p className="csv-help">Includes sales executives’ and team leaders’ own imports. Team filters use current assignments.</p></Card><Card className="csv-records-card"><div className="panel-heading"><h2>All sales{!loading && !failed ? ` (${total})` : ""}</h2><Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw className={loading ? "animate-spin" : ""}/> Refresh</Button></div>{loading ? <p>Loading sales…</p> : failed ? <p className="csv-help">Sales could not be loaded. Use Refresh to retry.</p> : records.length ? <RowsTable rows={records} admin timestamps/> : <p className="csv-help">No sales match these filters.</p>}{!loading && !failed && <div className="pagination"><Button disabled={page === 1} onClick={() => setPage(value => value - 1)}>← Previous</Button><span>Page {page}</span><Button disabled={!hasMore} onClick={() => setPage(value => value + 1)}>Next →</Button></div>}</Card></>;
}
