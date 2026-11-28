import { hasRole } from "@/lib/auth/roles";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { dashboardPath } from "@/lib/auth/dashboard-routing";
import { AdminSales } from "@/components/admin-sales";
export const metadata = { title: "Sales | Collective" };
async function Sales() {
  const user = await currentUser(true);
  if (!user) redirect("/login");
  if (!hasRole(user.app_metadata, "main_admin")) redirect(dashboardPath(user.app_metadata.role));
  return <AdminSales/>;
}
export default function Page() { return <main className="users-content"><section className="admin-heading"><h1>Sales</h1><p>View imported sales across your people and teams.</p></section><Suspense fallback={<p>Loading sales workspace…</p>}><Sales/></Suspense></main>; }
