import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { hasRole, type Role } from "@/lib/auth/roles";
import { dashboardPath } from "@/lib/auth/dashboard-routing";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { SalesRecovery } from "@/components/sales-recovery";
export const metadata = { title: "My recovery | Collective" };
async function MyRecovery() {
  const user = await currentUser(true);
  if (!user) redirect("/login");
  const primary = user.app_metadata.role;
  const role: Role | null = (primary === "team_leader" || primary === "sales_executive") && hasRole(user.app_metadata, primary) ? primary : hasRole(user.app_metadata, "team_leader") ? "team_leader" : hasRole(user.app_metadata, "sales_executive") ? "sales_executive" : null;
  if (!role) redirect(dashboardPath(primary));
  if (role === "team_leader") redirect("/team-recovery");
  return <WorkspaceLayout role={role}><main className="users-content recovery-sheet-content" aria-label="My recovery"><SalesRecovery/></main></WorkspaceLayout>;
}
export default function Page() {
  return <Suspense fallback={<p className="page-loading">Loading recovery workspace…</p>}><MyRecovery/></Suspense>;
}
