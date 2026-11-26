import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";
export const metadata = { title: "Dashboard | Collective" };
export default function Page() { return <Suspense fallback={<p className="page-loading">Loading dashboard…</p>}><Dashboard role="team_leader"/></Suspense>; }
