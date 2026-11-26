// Keep range selection inclusive and reversible while dragging in either direction.
export function selectionRange(ids: string[], start: number, end: number, base: string[] = []) {
  const first = Math.max(0, Math.min(start, end));
  const last = Math.min(ids.length - 1, Math.max(start, end));
  return [...new Set([...base, ...ids.slice(first, last + 1)])];
}

export function numberedRowRange(ids: string[], first: string, last: string) {
  if (!/^\d+$/.test(first) || !/^\d+$/.test(last)) throw new Error("Enter whole row numbers.");
  const start = Number(first), end = Number(last);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > ids.length) throw new Error(`Choose a range from 1 to ${ids.length}, with the last row at or after the first.`);
  return ids.slice(start - 1, end);
}
