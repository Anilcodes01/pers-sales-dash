import "server-only";
import { redirect } from "next/navigation";
import { currentUser } from "./session";
import { dashboardPath } from "./dashboard-routing";

export async function redirectSignedInUser() {
  const user = await currentUser(true);
  if (user) redirect(dashboardPath(user.app_metadata.role));
}
