import { ExternalLink } from "lucide-react";
export function PaymentLinkCell({ value }: { value: string }) {
  let safe = false;
  try { safe = new URL(value).protocol === "https:"; } catch { /* Plain imported text. */ }
  return safe ? <a className="sheet-payment-link" href={value} target="_blank" rel="noopener noreferrer" title={value}>{value}<ExternalLink size={12} data-copy-ignore/></a> : <span>{value || "—"}</span>;
}
