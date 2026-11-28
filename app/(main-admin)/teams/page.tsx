import { hasRole } from "@/lib/auth/roles";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { TeamManagement } from "@/components/team-management";
export const metadata = { title: "Teams | Collective" };
async function Teams() {
  const user = await currentUser(true);
  if (!user) redirect("/login");
  if (!hasRole(user.app_metadata, "main_admin")) redirect("/dashboard");
  return <TeamManagement />;
}
export default function TeamsPage() {
  return (
    <main className="teams-content">
      <section className="admin-heading">
        <h1>Teams</h1>
      </section>
      <Suspense fallback={<p>Checking access…</p>}>
        <Teams />
      </Suspense>
    </main>
  );
}
