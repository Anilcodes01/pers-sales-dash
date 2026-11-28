import { parse } from "csv-parse/sync";
import { leadColumns, type LeadValues } from "./columns";
export function parseRecoveryCsv(text: string) {
  let entries: { record: string[]; info: { lines: number } }[];
  try { entries = parse(text, { bom: true, skip_empty_lines: true, relax_column_count: true, info: true, max_record_size: 100_000 }) as unknown as typeof entries; }
  catch { throw new Error("CSV could not be read. Check the file's quotes and delimiters."); }
  const start = entries.findIndex(entry => entry.record.some(value => value.trim()));
  if (start < 0) throw new Error("The CSV is empty.");
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "").replace("referrals", "refferals");
  const headers = entries[start].record.map(normalize);
  const columns = Object.entries(leadColumns).map(([key, label]) => {
    if (key === "salesAssignedTo") return [key, -1] as const;
    const matches = headers.flatMap((header, index) => header === normalize(label) ? [index] : []);
    if (key === "executiveId" && !matches.length) return [key, -1] as const;
    if (matches.length !== 1) throw new Error(`CSV needs exactly one ${label} column.`);
    return [key, matches[0]] as const;
  });
  const source = entries.slice(start + 1).filter(entry => entry.record.some(value => value.trim()));
  if (!source.length) throw new Error("The CSV has no students to upload.");
  if (source.length > 5000) throw new Error("Upload at most 5,000 students at a time.");
  return source.map(({ record, info }) => ({ ...Object.fromEntries(columns.map(([key, index]) => [key, key === "salesAssignedTo" ? "" : key === "executiveId" ? (record[index] || "").trim().toUpperCase() : record[index] ?? ""])) as LeadValues, sourceRow: info.lines }));
}
