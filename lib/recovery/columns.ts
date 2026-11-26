export const leadColumns = {
  timestamp: "Timestamp",
  studentName: "Student Name",
  studentPhone: "Student Phone",
  studentEmail: "Student Email",
  studentCollegeEmail: "Student College Email",
  executiveName: "Student's Executive's Name",
  amountMentioned: "Amount Mentioned by Executive",
  registrationAmount: "Amount Paid for registration",
  programPlan: "Program Plan",
  domain: "Domain",
  selectedMonth: "Month selected",
  referrals: "Any refferals",
  paymentStatus: "payment_Status",
  leadStatus: "Lead_Status",
} as const;
export type LeadValues = Record<keyof typeof leadColumns, string>;
