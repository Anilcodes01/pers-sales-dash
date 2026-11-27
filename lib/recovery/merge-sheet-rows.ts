type SheetRow = { id: string; createdAt?: string };
function sameRow<T extends SheetRow>(a: T, b: T) {
  const keys = Object.keys(a) as (keyof T)[];
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
}
// Preserve the server's ordering (including paid-date ordering on Recovered Leads).
export function reconcileSheetRows<T extends SheetRow>(current: T[], incoming: T[]): T[] {
  const prior = new Map(current.map(row => [row.id, row]));
  const next = incoming.map(row => {
    const old = prior.get(row.id);
    return old && sameRow(old, row) ? old : row;
  });
  return next.length === current.length && next.every((row, index) => row === current[index]) ? current : next;
}
export function mergeSheetRows<T extends SheetRow>(current: T[], incoming: T[], removedIds: string[] = [], reset = false): T[] {
  if (!reset && !incoming.length && !removedIds.length) return current;
  const prior = new Map(current.map(row => [row.id, row]));
  const rows = reset ? new Map<string, T>() : new Map(prior);
  removedIds.forEach(id => rows.delete(id));
  for (const row of incoming) {
    const old = prior.get(row.id);
    rows.set(row.id, old && sameRow(old, row) ? old : row);
  }
  const next = [...rows.values()].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "") || a.id.localeCompare(b.id));
  return next.length === current.length && next.every((row, index) => row === current[index]) ? current : next;
}
