import { RecoveryAllocation } from "@/components/recovery-allocation";
export const metadata = { title: "My recovery calls | Collective" };
export default function Page() { return <main className="users-content recovery-sheet-content"><section className="admin-heading"><h1>My recovery calls</h1><p>Students allocated to you for recovery follow-up.</p></section><RecoveryAllocation executive/></main>; }
