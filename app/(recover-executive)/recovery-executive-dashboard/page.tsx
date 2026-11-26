import { RecoveryAllocation } from "@/components/recovery-allocation";
export const metadata = { title: "My recovery calls | Collective" };
export default function Page() {
  return (
    <main className="users-content recovery-sheet-content">
    
      <RecoveryAllocation executive />
    </main>
  );
}
