import { RecoveryLeads } from "@/components/recovery-leads";
export const metadata = { title: "Recovery leads | Collective" };
export default function Page() {
  return <main className="users-content"><section className="admin-heading"><h1>Recovery leads</h1><p>Upload students from your recovery CSV and view imported leads.</p></section><RecoveryLeads/></main>;
}
