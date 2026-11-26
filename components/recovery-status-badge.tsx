import { statusColors } from "@/lib/recovery/status-colors";
export function RecoveryStatusBadge({ field, value }: { field: "paymentStatus" | "leadStatus"; value: string }) {
  return <span className="recovery-status-badge" style={statusColors(field, value)}>{value || "—"}</span>;
}
