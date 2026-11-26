import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { dashboardPath } from "@/lib/auth/dashboard-routing";
import { SalesImports } from "@/components/sales-imports";
export const metadata = { title: "Import sales | Collective" };
async function Imports() {
  const user = await currentUser(true);
  if (!user) redirect("/login");
  if (user.app_metadata.role !== "sales_executive") redirect(dashboardPath(user.app_metadata.role));
  return <SalesImports endpoint="/api/sales-executives/imports"/>;
}
export default function Page() { return <main className="users-content"><section className="admin-heading"><h1>My sales</h1></section><Suspense fallback={<p>Loading sales workspace…</p>}><Imports/></Suspense></main>; }
