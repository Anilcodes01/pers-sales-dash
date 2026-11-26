import { isRole, type Role } from "./roles";

export const dashboardPaths: Record<Role, string> = {
  main_admin: "/admin-dashboard",
  recovery_admin: "/recovery-dashboard",
  recovery_executive: "/recovery-executive-dashboard",
  team_leader: "/team-dashboard",
  sales_executive: "/sales-dashboard",
};
export function dashboardPath(role: unknown) {
  return isRole(role) ? dashboardPaths[role] : "/dashboard";
}
