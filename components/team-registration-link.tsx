"use client";
import { useEffect, useState } from "react";
import { Input } from "./ui/input";
import { Copy, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
export function TeamRegistrationLink({ teamId, teamLead = false, expanded = false }: { teamId?: string; teamLead?: boolean; expanded?: boolean }) {
  const path = teamLead ? "/team-lead/register" : `/employee/${teamId}/register`;
  const label = teamLead ? "Team lead registration" : "Employee registration";
  const [url, setUrl] = useState(path);
  useEffect(() => { setUrl(new URL(path, window.location.origin).href); }, [path]);
  async function copy() {
    try { await navigator.clipboard.writeText(new URL(path, window.location.origin).href); toast.success(`${label} link copied.`); }
    catch { toast.error("Could not copy the link. Please try again."); }
  }
  if (expanded) return <div className="registration-share"><Input readOnly value={url} aria-label={`${label} link`} onFocus={event => event.target.select()}/><Button type="button" variant="outline" onClick={copy}><Copy size={16}/>Copy link</Button></div>;
  return <div className="team-registration-link"><a href={path} target="_blank" rel="noopener noreferrer" title={`Open ${label.toLowerCase()}`}><LinkIcon size={16}/><span>{label}</span></a><Button type="button" variant="ghost" size="icon" onClick={copy} aria-label={`Copy ${label.toLowerCase()} link`} title={`Copy ${label.toLowerCase()} link`}><Copy size={16}/></Button></div>;
}
