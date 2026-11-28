import { TeamRoster } from "@/components/team-roster";
export const metadata = { title: "My team | Collective" };
export default function Page() {
  return <main className="workspace-page team-roster-page" aria-label="Team"><TeamRoster/></main>;
}
