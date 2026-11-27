"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { VirtualTableBody } from "./virtual-table-body";
import { toast } from "sonner";
import { Upload, Download, Loader2, RefreshCw } from "lucide-react";
import { RecoveryStatusCell } from "./recovery-status-cell";
import { RecoveryPaymentLinkEditor } from "./recovery-payment-link-editor";
import { PaymentLinkCell } from "./payment-link-cell";
import { RecoveryStatusBadge } from "./recovery-status-badge";
import { leadColumns, type LeadValues } from "@/lib/recovery/columns";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { SheetFind } from "./sheet-find";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableCell,
} from "./ui/table";
type Row = LeadValues & { id?: string; createdAt?: string; updatedAt?: string };
function LeadsTable({ rows, saved = false, onSaved }: { rows: Row[]; saved?: boolean; onSaved?: (id: string, field: keyof LeadValues, value: string) => void }) {
  return (
    <Table className="people-table sales-table">
      <TableHeader>
        <TableRow>
          {Object.values(leadColumns).map((label) => (
            <TableHead key={label}>{label}</TableHead>
          ))}
          {saved && (
            <>
              <TableHead>Created at (UTC)</TableHead>
              <TableHead>Updated at (UTC)</TableHead>
            </>
          )}
        </TableRow>
      </TableHeader>
      <VirtualTableBody rows={rows} columns={Object.keys(leadColumns).length + (saved ? 2 : 0)} rowKey={(row, index) => row.id || index}>
        {(row, index) => (
          <TableRow key={row.id || index} data-sheet-row-id={row.id || String(index)}>
            {(Object.keys(leadColumns) as (keyof LeadValues)[]).map((key) => (
              <TableCell key={key}>
                {saved && row.id && (key === "paymentStatus" || key === "leadStatus") ? <RecoveryStatusCell admin id={row.id} field={key} student={row.studentName} value={row[key]} onSaved={(value, changes) => { onSaved?.(row.id!, key, value); if (key === "leadStatus" && changes?.paymentStatus) onSaved?.(row.id!, "paymentStatus", changes.paymentStatus); }}/> : saved && row.id && key === "paymentLinks" ? <RecoveryPaymentLinkEditor id={row.id} value={row[key]} onSaved={value => onSaved?.(row.id!, key, value)}/> : key === "paymentStatus" || key === "leadStatus" ? (
                  <RecoveryStatusBadge field={key} value={row[key]} />
                ) : key === "paymentLinks" ? (
                  <PaymentLinkCell value={row[key]}/>
                ) : (
                  row[key]
                )}
              </TableCell>
            ))}
            {saved && (
              <>
                <TableCell>
                  {row.createdAt?.replace("T", " ").slice(0, 19)}
                </TableCell>
                <TableCell>
                  {row.updatedAt?.replace("T", " ").slice(0, 19)}
                </TableCell>
              </>
            )}
          </TableRow>
        )}
      </VirtualTableBody>
    </Table>
  );
}
export function RecoveryLeads() {
  const sheet = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
    totalRows: number;
    preview: Row[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [records, setRecords] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setFailed(false);
      try {
        const response = await fetch(`/api/recovery-admin/leads?page=${page}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load recovery leads.");
        setRecords(data.records);
        setTotal(data.total);
        setHasMore(data.hasMore);
      } catch (error) {
        if (!controller.signal.aborted) {
          setFailed(true);
          toast.error(
            error instanceof Error ? error.message : "Could not load leads.",
            { id: "recovery-load" },
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [page, revision]);
  async function upload(action: "preview" | "import") {
    if (!file) return;
    if (
      !file.name.toLowerCase().endsWith(".csv") ||
      file.size > 5 * 1024 * 1024
    ) {
      toast.error("Choose a CSV file up to 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("action", action);
      const response = await fetch("/api/recovery-admin/leads", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed.");
      if (action === "preview") setPreview(data);
      else {
        toast.success(`${data.imported} students uploaded.`);
        setPreview(null);
        setFile(null);
        if (input.current) input.current.value = "";
        setPage(1);
        setRevision((value) => value + 1);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
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
          <h2>Upload recovery students</h2>
          <Button asChild variant="outline">
            <a href="/recovery-leads-template.csv" download>
              <Download /> CSV template
            </a>
          </Button>
        </div>
        <form className="auth-form csv-upload-form" onSubmit={submit}>
          <label>
            CSV file
            <Input
              ref={input}
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
          <Button type="submit" disabled={busy || !file}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} Preview
            CSV
          </Button>
        </form>
        <p className="csv-help">
          Up to 5 MB / 5,000 students. Values and blank cells are kept as
          supplied. Month comes from the sheet. Include Amount paid, Comments,
          Remaining amount need to pay, and payment_links headers. Payment links
          can be blank. All rows are imported, including repeated rows;
          uploading the same file again creates another copy.
        </p>
      </Card>
      {preview && (
        <Card className="csv-preview-card">
          <div className="panel-heading">
            <div>
              <h2>Upload preview</h2>
              <p className="csv-help">
                {preview.totalRows} students ready. Showing the first 20 rows.
              </p>
            </div>
            <Button disabled={busy} onClick={() => void upload("import")}>
              {busy ? <Loader2 className="animate-spin" /> : <Upload />} Confirm
              upload
            </Button>
          </div>
          <LeadsTable rows={preview.preview} />
        </Card>
      )}
      <Card ref={sheet} className="csv-records-card">
        <SheetFind rows={loading ? [] : records} root={sheet} source={{ endpoint: "/api/recovery-admin/sheet-search?scope=leads", onPage: setPage }}/>
        <div className="panel-heading">
          <h2>Recovery leads{!loading && !failed ? ` (${total})` : ""}</h2>
          <Button
            variant="outline"
            disabled={busy || loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw /> Refresh
          </Button>
        </div>
        {loading ? (
          <p>Loading students…</p>
        ) : failed ? (
          <p>Unable to load students. Use Refresh to retry.</p>
        ) : records.length ? (
          <LeadsTable rows={records} saved onSaved={(id, field, value) => setRecords(rows => rows.map(row => row.id === id ? { ...row, [field]: value } : row))}/>
        ) : (
          <p>No students uploaded yet.</p>
        )}
        {!loading && !failed && (
          <div className="pagination">
            <Button
              disabled={busy || page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              ← Previous
            </Button>
            <span>Page {page}</span>
            <Button
              disabled={busy || !hasMore}
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
