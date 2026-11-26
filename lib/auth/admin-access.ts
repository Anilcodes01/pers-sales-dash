import "server-only";
import { currentUser } from "./session";

export class AccessError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function requireMainAdmin() {
  const user = await currentUser();
  if (!user) throw new AccessError(401, "Sign in to continue.");
  if (user.app_metadata.role !== "main_admin") throw new AccessError(403, "Only the main admin can manage accounts.");
  return user;
}
