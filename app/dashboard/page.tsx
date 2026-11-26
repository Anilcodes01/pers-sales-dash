import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";
import { WorkspaceLayout } from "@/components/workspace-layout";
export default function Page() {
  return (
    <Suspense fallback={<p className="page-loading">Loading workspace…</p>}>
      <WorkspaceLayout>
        <Dashboard />
      </WorkspaceLayout>
    </Suspense>
  );
}
