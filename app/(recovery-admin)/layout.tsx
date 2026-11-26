import { Suspense } from "react";
import { WorkspaceLayout } from "@/components/workspace-layout";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p className="page-loading">Loading workspace…</p>}><WorkspaceLayout role="recovery_admin">{children}</WorkspaceLayout></Suspense>;
}
