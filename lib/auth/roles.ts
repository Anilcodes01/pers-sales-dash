export const roles = {
  main_admin: "Main admin",
  recovery_admin: "Recovery admin",
  recovery_executive: "Recovery executive",
  team_leader: "Team leader",
  sales_executive: "Sales executive",
} as const;
export type Role = keyof typeof roles;
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && Object.hasOwn(roles, value);
}


/** Legacy single-role accounts remain valid until an admin assigns multiple roles. */
export function assignedRoles(metadata: Record<string, unknown>): Role[] {
  return Array.isArray(metadata.roles)
    ? [...new Set(metadata.roles.filter(isRole))]
    : isRole(metadata.role) ? [metadata.role] : [];
}
export function hasRole(metadata: Record<string, unknown>, role: Role) {
  return assignedRoles(metadata).includes(role);
}
