import { RecoveryAllocation } from "@/components/recovery-allocation";
export const metadata = { title: "Allocation | Collective" };
export default function Page() { return <main className="users-content recovery-sheet-content"><section className="admin-heading"><h1>Allocation</h1><p>Assign recovery students to executives by month.</p></section><RecoveryAllocation/></main>; }
