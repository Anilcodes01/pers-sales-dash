export const paymentStatuses = ["unpaid", "paid", "default"] as const;
export const leadStatuses = [
  "called", "not answered", "disconnected", "incoming call not available", "busy", "affirmed", "call again",
  "sold for 1000", "batch change when paid", "batch change - will pay in next batch", "discount", "misc", "ca",
  "pay after lms", "without gst", "pay in instalments", "number does not exist", "pay after training", "ignore",
  "talk to executive", "MPKD", "wrong number", "SWT OFF",
] as const;
