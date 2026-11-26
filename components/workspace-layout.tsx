import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { isRole, type Role } from "@/lib/auth/roles";
import { dashboardPath } from "@/lib/auth/dashboard-routing";
import { WorkspaceFrame } from "./workspace-frame";
export async function WorkspaceLayout({ role, children }: { role?: Role; children: React.ReactNode }) {
  const user = await currentUser(true);
  if (!user) redirect("/login");
  const actualRole = user.app_metadata.role;
  if (role && actualRole !== role) redirect(dashboardPath(actualRole));
  const name = typeof user.user_metadata.full_name === "string" && user.user_metadata.full_name.trim() ? user.user_metadata.full_name : user.email?.split("@")[0] || "Team member";
  const avatar = user.user_metadata.avatar_url;
  return <WorkspaceFrame profile={{ email: user.email || "", name, role: isRole(actualRole) ? actualRole : null, avatarUrl: typeof avatar === "string" && avatar.startsWith("https://") ? avatar : undefined }}>{children}</WorkspaceFrame>;
}
