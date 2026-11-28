import { db } from "@/lib/db";
import { TeamRegistrationLink } from "./team-registration-link";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { hasRole, isRole, roles, type Role } from "@/lib/auth/roles";
import { dashboardPath } from "@/lib/auth/dashboard-routing";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Users,
  ShieldCheck,
  ChartNoAxesCombined,
  Wallet,
} from "lucide-react";

export async function Dashboard({ role }: { role?: Role }) {
  const user = await currentUser(true);
  if (!user) redirect("/login");
  const actualRole = role && hasRole(user.app_metadata, role) ? role : user.app_metadata.role;
  if ((!role && isRole(actualRole)) || (role && !hasRole(user.app_metadata, role)))
    redirect(dashboardPath(actualRole));
  if (actualRole === "main_admin") {
    const name = typeof user.user_metadata.full_name === "string" && user.user_metadata.full_name.trim() ? user.user_metadata.full_name.trim() : user.email?.split("@")[0] || "there";
    return <section className="workspace-page employee-overview" aria-label="Overview"><header><h1>Welcome, {name}!</h1><p className="csv-help">Manage your teams and employee accounts.</p></header><Card className="workspace-card"><CardHeader><CardTitle>Invite your team leads</CardTitle><CardDescription>Share this link with your team leads to register and select their team.</CardDescription></CardHeader><CardContent><TeamRegistrationLink teamLead expanded/></CardContent></Card><div className="management-actions"><Button asChild><Link href="/users">Manage team accounts <ArrowRight/></Link></Button><Button asChild variant="outline"><Link href="/teams">Teams <Users/></Link></Button></div></section>;
  }
  if (actualRole === "team_leader" || actualRole === "sales_executive") {
    const name = typeof user.user_metadata.full_name === "string" && user.user_metadata.full_name.trim() ? user.user_metadata.full_name.trim() : user.email?.split("@")[0] || "there";
    const membership = await db().teamMembership.findUnique({ where: { userId: user.id }, select: { teamId: true, team: { select: { name: true } } } });
    return <section className="workspace-page employee-overview" aria-label="Overview"><header><h1>Welcome, {name}!</h1><p className="csv-help">{membership ? `You’re part of ${membership.team.name}.` : "Welcome to your workspace."}</p></header>{actualRole === "team_leader" && <Card className="workspace-card"><CardHeader><CardTitle>Grow your team</CardTitle><CardDescription>Share this link with your sales executives to register.</CardDescription></CardHeader><CardContent>{membership ? <TeamRegistrationLink teamId={membership.teamId} expanded/> : <p className="csv-help">Ask your administrator to assign your team to get its registration link.</p>}</CardContent></Card>}<div className="management-actions"><Button asChild><Link href={actualRole === "team_leader" ? "/team-imports" : "/sales-imports"}>My sales <ArrowRight/></Link></Button>{actualRole === "team_leader" && <Button asChild variant="outline"><Link href="/team">View team <Users/></Link></Button>}</div></section>;
  }
  return (
    <section className="workspace-page workspace-overview" aria-label="Overview">
      <div className="dashboard-grid">
        <Card className="workspace-card featured-card">
          <CardHeader>
            <div className="card-icon">
              <Users size={21} />
            </div>
            <CardTitle>
              {actualRole === "main_admin"
                ? "Bring your team together"
                : "You’re in the right place"}
            </CardTitle>
            <CardDescription>
              {actualRole === "main_admin"
                ? "Give your team the right access. Create accounts, assign roles, and keep credentials up to date."
                : isRole(actualRole)
                  ? "Your access is ready. Sales and recovery tools will appear here as they are built."
                  : "Your account needs a role. Contact your main administrator to get access."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {actualRole === "main_admin" ? (
              <Button asChild>
                <Link href="/users">
                  Manage team accounts <ArrowRight />
                </Link>
              </Button>
            ) : (
              <Badge variant="secondary">
                {isRole(actualRole) ? "Account ready" : "Role pending"}
              </Badge>
            )}
          </CardContent>
        </Card>
        <Card className="workspace-card">
          <CardHeader>
            <div className="card-icon muted-icon">
              <ChartNoAxesCombined size={21} />
            </div>
            <CardTitle>Sales workspace</CardTitle>
            <CardDescription>
              Monthly enrollments and a clearer view of sales progress.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">Coming next</Badge>
          </CardContent>
        </Card>
        <Card className="workspace-card">
          <CardHeader>
            <div className="card-icon muted-icon">
              <Wallet size={21} />
            </div>
            <CardTitle>Recovery workspace</CardTitle>
            <CardDescription>
              Connected follow-ups and payment progress for your team.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">Coming next</Badge>
          </CardContent>
        </Card>
      </div>
      <div className="workspace-note">
        <ShieldCheck size={16} />
        <p>
          Account or password help? Your main administrator can help you get
          back on track.
        </p>
      </div>
    </section>
  );
}
