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

