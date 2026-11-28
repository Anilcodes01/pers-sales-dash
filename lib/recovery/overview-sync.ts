// Explicit projection excludes internal locks, import metadata, and legacy columns.
export const sheetSelect = {
  id: true, assignedTo: true, createdAt: true, paidAt: true,
  timestamp: true, studentName: true, studentPhone: true, studentEmail: true,
  studentCollegeEmail: true, executiveName: true, executiveId: true, salesAssignedTo: true, amountMentioned: true,
  programPlan: true, domain: true, selectedMonth: true, referrals: true,
  amountPaid: true, paymentStatus: true, leadStatus: true, comments: true,
  remainingAmount: true, paymentLinks: true,
} as const;
