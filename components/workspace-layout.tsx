import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { assignedRoles, hasRole, isRole, type Role } from "@/lib/auth/roles";
import { dashboardPath } from "@/lib/auth/dashboard-routing";
import { RecoveryStatisticsProvider } from "./recovery-statistics-panel";
import { WorkspaceFrame } from "./workspace-frame";
export async function WorkspaceLayout({ role, children }: { role?: Role; children: React.ReactNode }) {
  const user = await currentUser(true);
  if (!user) redirect("/login");
  const actualRole = user.app_metadata.role;
  if (role && !hasRole(user.app_metadata, role)) redirect(dashboardPath(actualRole));
  const name = typeof user.user_metadata.full_name === "string" && user.user_metadata.full_name.trim() ? user.user_metadata.full_name : user.email?.split("@")[0] || "Team member";
  const avatar = user.user_metadata.avatar_url;
  const membership = hasRole(user.app_metadata, "team_leader") ? await db().teamMembership.findUnique({ where: { userId: user.id }, select: { teamId: true } }) : null;
  return <RecoveryStatisticsProvider><WorkspaceFrame profile={{ teamId: membership?.teamId, id: user.id, themeColor: typeof user.user_metadata.theme_color === "string" ? user.user_metadata.theme_color : undefined, email: user.email || "", name, roles: assignedRoles(user.app_metadata), role: role || (isRole(actualRole) ? actualRole : null), avatarUrl: typeof avatar === "string" && avatar.startsWith("https://") ? avatar : undefined }}>{children}</WorkspaceFrame></RecoveryStatisticsProvider>;
}
