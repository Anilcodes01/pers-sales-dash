import { RecoveredLeads } from "@/components/recovered-leads";
export const metadata = { title: "Recovery students | Collective" };
export default function Page() {
  return <main className="users-content recovery-sheet-content"><RecoveredLeads individual={false}/></main>;
}
