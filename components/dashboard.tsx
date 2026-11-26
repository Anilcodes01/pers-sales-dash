import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { isRole, roles, type Role } from "@/lib/auth/roles";
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
  const actualRole = user.app_metadata.role;
  if ((!role && isRole(actualRole)) || (role && actualRole !== role))
    redirect(dashboardPath(actualRole));
  return (
    <section className="dashboard-content">
      <Badge variant="secondary">
        {isRole(actualRole) ? roles[actualRole] : "Account"}
      </Badge>
      <h1>Your workspace, at a glance.</h1>
      <p className="page-description">
        A focused place for your team’s next steps.
      </p>
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
