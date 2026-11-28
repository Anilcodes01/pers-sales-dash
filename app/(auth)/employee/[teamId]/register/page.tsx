import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { TeamRegistrationForm } from "@/components/team-registration-form";
export const metadata = { title: "Employee registration | Collective" };
async function Registration({ params }: { params: Promise<{ teamId: string }> }) {
  await connection();
  const { teamId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamId)) notFound();
  const team = await db().team.findUnique({ where: { id: teamId }, select: { id: true, name: true } });
  if (!team) notFound();
  return <><h1>Join {team.name}</h1><p className="auth-intro">Create your employee account to join this team.</p><TeamRegistrationForm kind="employee" team={team}/></>;
}
export default function Page(props: { params: Promise<{ teamId: string }> }) { return <Suspense fallback={<p>Loading your team…</p>}><Registration {...props}/></Suspense>; }
