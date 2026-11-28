import { hasRole } from "@/lib/auth/roles";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { dashboardPath } from "@/lib/auth/dashboard-routing";
import { SalesImports } from "@/components/sales-imports";
export const metadata = { title: "Import sales | Collective" };
async function Imports() {
  const user = await currentUser(true);
  if (!user) redirect("/login");
  if (!hasRole(user.app_metadata, "team_leader")) redirect(dashboardPath(user.app_metadata.role));
  return <SalesImports endpoint="/api/team-lead/imports"/>;
}
export default function Page() { return <main className="workspace-page sales-import-page" aria-label="My sales"><Suspense fallback={<p>Loading sales workspace…</p>}><Imports/></Suspense></main>; }
