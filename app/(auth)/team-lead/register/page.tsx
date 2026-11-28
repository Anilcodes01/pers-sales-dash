import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { TeamRegistrationForm } from "@/components/team-registration-form";
export const metadata = { title: "Team lead registration | Collective" };
async function Registration() {
  await connection();
  const teams = await db().team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return <><h1>Register as a team lead</h1><p className="auth-intro">Select your team and create your account. You’ll get a registration link to share with your employees.</p><TeamRegistrationForm kind="team-lead" teams={teams}/></>;
}
export default function Page() { return <Suspense fallback={<p>Loading teams…</p>}><Registration/></Suspense>; }
