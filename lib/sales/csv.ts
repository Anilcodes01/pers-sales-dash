import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5000;
const aliases = {
  dateFromCsv: ["date", "datefromcsv"], name: ["name"], college: ["college"],
  emailId: ["email", "emailid"], phone: ["phone", "phoneno", "phonenumber"],
  whatsapp: ["whatsapp", "whatsappno", "whatsappnumber"], programPlan: ["programplan", "program"],
  totalAmountPaise: ["amount", "totalamount"], registrationAmountPaise: ["prereg", "registrationamount", "registration"], comments: ["comments", "comment"],
} as const;
export type CsvRow = { sourceRow: number; dateFromCsv: string | null; name: string; college: string; emailId: string | null; phone: string | null; whatsapp: string | null; programPlan: string; totalAmountPaise: number | null; registrationAmountPaise: number | null; comments: string | null; rawValues: Record<string, string>; rowHash: string };
export function reportingMonth(value: unknown) {
  if (typeof value !== "string" || !/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value)) throw new Error("Choose a valid month and year (2000–2100).");
  return new Date(`${value}-01T00:00:00.000Z`);
}
function csvDate(value: string) {
  let year: number, month: number, day: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const local = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(value);
  if (iso) [, year, month, day] = iso.map(Number);
  else if (local) { day = Number(local[1]); month = Number(local[2]); year = Number(local[3]); }
  else throw new Error("Use DD-MM-YYYY, DD/MM/YYYY, or YYYY-MM-DD.");
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || year > 2100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error("Enter a valid calendar date (2000–2100).");
  return date.toISOString().slice(0, 10);
}
function money(value: string) {
  const formatted = value.replace(/^(?:₹|rs\.?|inr)\s*/i, "").trim();
  if (formatted.includes(",") && !/^(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(formatted)) throw new Error("Use valid thousands separators or an unformatted amount.");
  const cleaned = formatted.replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) throw new Error("Enter a non-negative amount with up to two decimal places.");
  const [whole, fraction = ""] = cleaned.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount > 2_000_000_000) throw new Error("Amount is too large.");
  return amount;
}
export function parseSalesCsv(text: string) {
  let entries: { record: string[]; info: { lines: number } }[];
  try { entries = parse(text, { bom: true, skip_empty_lines: true, relax_column_count: true, info: true, max_record_size: 100_000 }) as unknown as typeof entries; }
  catch { throw new Error("CSV could not be read. Check quotes and the number of columns on each row."); }
  const headerIndex = entries.findIndex(entry => entry.record.some(value => value.trim()));
  if (headerIndex < 0) throw new Error("The CSV is empty.");
  const headers = entries[headerIndex].record.map(value => value.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const columns = {} as Record<keyof typeof aliases, number>;
  for (const [field, names] of Object.entries(aliases)) {
    const matches = headers.flatMap((header, index) => (names as readonly string[]).includes(header) ? [index] : []);
    if (matches.length !== 1) throw new Error(`CSV needs exactly one ${names[0]} column.`);
    columns[field as keyof typeof aliases] = matches[0];
  }
  const source = entries.slice(headerIndex + 1).filter(entry => entry.record.some(value => value.trim()));
  if (!source.length) throw new Error("The CSV has no data rows.");
  if (source.length > MAX_ROWS) throw new Error(`Upload at most ${MAX_ROWS} data rows at a time.`);
  const rows: CsvRow[] = [];
  const occurrences = new Map<string, number>();
  for (const { record, info } of source) {
    const values = Object.fromEntries(Object.entries(columns).map(([field, index]) => [field, record[index] ?? ""])) as Record<keyof typeof aliases, string>;
    let dateFromCsv: string | null = null, totalAmountPaise: number | null = null, registrationAmountPaise: number | null = null;
    // Parsed fields are optional helpers; the original cells are always retained.
    try { dateFromCsv = csvDate(values.dateFromCsv.trim()); } catch { /* Preserve the original date below. */ }
    try { totalAmountPaise = money(values.totalAmountPaise.trim()); } catch { /* Preserve the original amount below. */ }
    try { registrationAmountPaise = money(values.registrationAmountPaise.trim()); } catch { /* Preserve the original amount below. */ }
    const data = { dateFromCsv, name: values.name, college: values.college, emailId: values.emailId || null, phone: values.phone || null, whatsapp: values.whatsapp || null, programPlan: values.programPlan, totalAmountPaise, registrationAmountPaise, comments: values.comments || null };
    // Match existing normalized hashes for ordinary rows, while retaining repeated rows in a file.
    const fingerprint = { ...data, name: data.name.trim(), college: data.college.trim(), emailId: data.emailId?.trim().toLowerCase() || null, phone: data.phone?.trim() || null, whatsapp: data.whatsapp?.trim() || null, programPlan: data.programPlan.trim(), comments: data.comments?.trim() || null };
    const baseHash = createHash("sha256").update(JSON.stringify(dateFromCsv === null || totalAmountPaise === null || registrationAmountPaise === null ? values : fingerprint)).digest("hex");
    const occurrence = occurrences.get(baseHash) || 0;
    occurrences.set(baseHash, occurrence + 1);
    const rowHash = occurrence === 0 ? baseHash : createHash("sha256").update(`${baseHash}:${occurrence}`).digest("hex");
    rows.push({ ...data, rawValues: values, sourceRow: info.lines, rowHash });
  }
  return { rows, totalRows: source.length };
}
