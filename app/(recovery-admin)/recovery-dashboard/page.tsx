import { RecoveryOverview } from "@/components/recovery-overview";
export const metadata = { title: "Recovery overview | Collective" };
export default function Page() {
  return (
    <main
      className="users-content recovery-sheet-content recovery-overview-content"
      aria-label="Recovery overview"
    >
      <RecoveryOverview />
    </main>
  );
}
