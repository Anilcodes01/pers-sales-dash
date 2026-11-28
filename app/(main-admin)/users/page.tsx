import { hasRole } from "@/lib/auth/roles";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { adminConfigured } from "@/lib/supabase/admin";
import { UserManagement } from "@/components/user-management";
export const metadata = { title: "Manage accounts | Collective" };
async function AdminUsers() {
  const user = await currentUser(true);
  if (!user) redirect("/login");
  if (!hasRole(user.app_metadata, "main_admin")) redirect("/dashboard");
  return (
    <UserManagement currentUserId={user.id} configured={adminConfigured()} />
  );
}
export default function UsersPage() {
  return (
    <main className="users-content">
    
      <Suspense
        fallback={
          <p className="admin-loading">Checking administrator access…</p>
        }
      >
        <AdminUsers />
      </Suspense>
    </main>
  );
}
