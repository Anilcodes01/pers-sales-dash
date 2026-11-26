import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { adminConfigured } from "@/lib/supabase/admin";
import { UserManagement } from "@/components/user-management";
export const metadata = { title: "Manage accounts | Collective" };
async function AdminUsers() {
  const user = await currentUser(true);
  if (!user) redirect("/login");
  if (user.app_metadata.role !== "main_admin") redirect("/dashboard");
  return <UserManagement currentUserId={user.id} configured={adminConfigured()}/>;
}
export default function UsersPage() {
  return <main className="users-content"><section className="admin-heading"><h1>Users</h1><p>Create accounts, assign roles, and manage passwords for your team.</p></section><Suspense fallback={<p className="admin-loading">Checking administrator access…</p>}><AdminUsers/></Suspense></main>;
}
