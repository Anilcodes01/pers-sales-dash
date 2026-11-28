import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";
export const metadata = { title: "Overview | Collective" };
export default function Page() { return <Suspense fallback={<p className="page-loading">Loading overview…</p>}><Dashboard role="team_leader"/></Suspense>; }
