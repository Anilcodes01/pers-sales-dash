"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { VirtualTableBody } from "./virtual-table-body";
import { toast } from "sonner";
import { Upload, FileCheck2, Loader2, Download, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableCell,
} from "./ui/table";

export type Row = {
  owner?: { id: string; name: string; email: string };
  team?: { id: string; name: string } | null;
  reportingMonth?: string;
  id?: string;
  sourceRow?: number;
  dateFromCsv: string | null;
  name: string;
  college: string;
  emailId: string | null;
  phone: string | null;
  whatsapp: string | null;
  programPlan: string;
  totalAmountPaise: number | null;
  registrationAmountPaise: number | null;
  comments: string | null;
  rawValues?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
};
type Preview = { totalRows: number; preview: Row[] };
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const amount = (value: number | null) =>
  value === null
    ? ""
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(value / 100);
const date = (value: string | null) => {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}-${month}-${year}`;
};
export function RowsTable({
  rows,
  timestamps = false,
  admin = false,
}: {
  rows: Row[];
  timestamps?: boolean;
  admin?: boolean;
}) {
  return (
    <Table className="people-table sales-table">
      <TableHeader>
        <TableRow>
          {[
            ...(admin ? ["Salesperson", "Team", "Month"] : []),
            "Date",
            "Name",
            "College",
            "Email",
            "Phone",
            "WhatsApp",
            "Program plan",
            "Total amount",
            "Registration",
            "Comments",
            ...(timestamps ? ["Created at", "Updated at"] : []),
          ].map((title) => (
            <TableHead key={title}>{title}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <VirtualTableBody rows={rows} columns={10 + (admin ? 3 : 0) + (timestamps ? 2 : 0)} rowKey={(row, index) => row.id || index}>
        {(row, index) => (
          <TableRow key={row.id || index}>
            {admin && (
              <>
                <TableCell>
                  <strong>
                    {row.owner?.name || row.owner?.email || "Unknown owner"}
                  </strong>
                  {row.owner?.name && <small>{row.owner.email}</small>}
                </TableCell>
                <TableCell>{row.team?.name || "Unassigned"}</TableCell>
                <TableCell>{row.reportingMonth?.slice(0, 7)}</TableCell>
              </>
            )}
            <TableCell>
              {row.rawValues?.dateFromCsv ?? date(row.dateFromCsv)}
            </TableCell>
            <TableCell>{row.name}</TableCell>
            <TableCell>{row.college}</TableCell>
            <TableCell>{row.emailId || "—"}</TableCell>
            <TableCell>{row.phone || "—"}</TableCell>
            <TableCell>{row.whatsapp || "—"}</TableCell>
            <TableCell>{row.programPlan}</TableCell>
            <TableCell>
              {row.rawValues?.totalAmountPaise ?? amount(row.totalAmountPaise)}
            </TableCell>
            <TableCell>
              {row.rawValues?.registrationAmountPaise ??
                amount(row.registrationAmountPaise)}
            </TableCell>
            <TableCell className="csv-comments">
              {row.comments || "—"}
            </TableCell>
            {timestamps && (
              <>
                <TableCell>
                  {row.createdAt?.replace("T", " ").slice(0, 19)} UTC
                </TableCell>
                <TableCell>
                  {row.updatedAt?.replace("T", " ").slice(0, 19)} UTC
                </TableCell>
              </>
            )}
          </TableRow>
        )}
      </VirtualTableBody>
    </Table>
  );
}
export function SalesImports({ endpoint }: { endpoint: string }) {
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedMonth = `${year}-${month}`;
  const validMonth = /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(selectedMonth);
  useEffect(() => {
    if (!validMonth) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setLoadFailed(false);
      try {
        const response = await fetch(
          `${endpoint}?month=${selectedMonth}&page=${page}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Unable to load your sales records.");
        setRecords(data.records);
        setTotal(data.total);
        setHasMore(data.hasMore);
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadFailed(true);
          toast.error(
            error instanceof Error ? error.message : "Unable to load records.",
            { id: "sales-load-error" },
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [endpoint, selectedMonth, validMonth, page, revision]);
  function resetPreview() {
    setPreview(null);
    setPage(1);
  }
  async function upload(action: "preview" | "import") {
    if (!validMonth || !file) {
      toast.error("Select a month, year, and CSV file first.");
      return;
    }
    if (
      file.size > 5 * 1024 * 1024 ||
      !file.name.toLowerCase().endsWith(".csv")
    ) {
      toast.error("Choose a CSV file no larger than 5 MB.");
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.set("month", selectedMonth);
    form.set("action", action);
    form.set("file", file);
    try {
      const response = await fetch(endpoint, { method: "POST", body: form });
      const data = await response.json();
      if (action === "preview" && data.preview) setPreview(data);
      if (!response.ok)
        throw new Error(data.error || "The CSV could not be imported.");
      if (action === "preview")
        toast.success(
          `${data.totalRows} rows read. Review the preview and confirm the import.`,
        );
      else {
        toast.success(
          `${data.imported} rows imported. ${data.skipped} exact duplicates skipped.`,
        );
        setPreview(null);
        setFile(null);
        if (fileInput.current) fileInput.current.value = "";
        setPage(1);
        setRevision((value) => value + 1);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Upload failed. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void upload("preview");
  }
  return (
    <>
      <Card className="csv-upload-card">
        <div className="panel-heading">
          <div>
            <h2>Import monthly sales</h2>
            <p className="csv-help">
              Choose the reporting month, upload your CSV, and review before
              importing.
            </p>
          </div>
          <Button asChild variant="outline">
            <a href="/sales-import-template.csv" download>
              <Download /> CSV template
            </a>
          </Button>
        </div>
        <form className="auth-form csv-upload-form" onSubmit={submit}>
          <label>
            Month
            <Select
              value={month}
              onValueChange={(value) => {
                setMonth(value);
                resetPreview();
              }}
              required
              disabled={busy}
            >
              <SelectTrigger aria-label="Reporting month">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {months.map((name, index) => (
                  <SelectItem
                    value={String(index + 1).padStart(2, "0")}
                    key={name}
                  >
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label>
            Year
            <Input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(event) => {
                setYear(event.target.value);
                resetPreview();
              }}
              placeholder="e.g. 2026"
              required
              disabled={busy}
            />
          </label>
          <label>
            CSV file
            <Input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              required
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setPreview(null);
              }}
            />
          </label>
          <Button disabled={busy || !validMonth || !file} type="submit">
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} Preview
            CSV
          </Button>
        </form>
        <p className="csv-help">
          Up to 5 MB / 5,000 rows. Blank contact fields are allowed. Repeated
          rows in the file are retained; previously imported copies are skipped.
        </p>
      </Card>
      {preview && (
        <Card className="csv-preview-card">
          <div className="panel-heading">
            <div>
              <h2>Upload preview</h2>
              <p className="csv-help">
                {preview.totalRows} rows ready to upload. Showing the first 20
                rows.
              </p>
            </div>
            <Button
              disabled={busy}
              onClick={() => {
                void upload("import");
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : <FileCheck2 />}{" "}
              Confirm import
            </Button>
          </div>
          <RowsTable rows={preview.preview} />
        </Card>
      )}
      <Card className="csv-records-card">
        <div className="panel-heading">
          <h2>
            Your monthly sales
            {validMonth && !loading && !loadFailed ? ` (${total})` : ""}
          </h2>
          <Button
            variant="outline"
            disabled={!validMonth || loading || busy}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
        {!validMonth ? (
          <p className="csv-help">
            Select a month and year to view your imported sales.
          </p>
        ) : loading ? (
          <p>Loading records…</p>
        ) : loadFailed ? (
          <p className="csv-help">
            Records could not be loaded. Use Refresh to retry.
          </p>
        ) : !records.length ? (
          <p className="csv-help">No sales imported for this month yet.</p>
        ) : (
          <RowsTable rows={records} timestamps />
        )}
        {validMonth && !loading && !loadFailed && (
          <div className="pagination">
            <Button
              disabled={page === 1 || busy}
              onClick={() => setPage((value) => value - 1)}
            >
              ← Previous
            </Button>
            <span>Page {page}</span>
            <Button
              disabled={!hasMore || busy}
              onClick={() => setPage((value) => value + 1)}
            >
              Next →
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
