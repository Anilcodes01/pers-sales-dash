import { AccessError } from "@/lib/auth/admin-access";
export function studentPaymentFilter(value: string | null) {
  const status = value ?? "all";
  if (!["all", "paid", "unpaid"].includes(status)) throw new AccessError(400, "Choose All, Paid, or Unpaid.");
  // Unpaid includes blank/default/custom statuses: everyone not marked paid.
  return status === "all" ? {} : { paymentStatus: status === "paid" ? { equals: "paid", mode: "insensitive" as const } : { not: "paid", mode: "insensitive" as const } };
}
