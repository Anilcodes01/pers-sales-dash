// Keep range selection inclusive and reversible while dragging in either direction.
export function selectionRange(ids: string[], start: number, end: number, base: string[] = []) {
  const first = Math.max(0, Math.min(start, end));
  const last = Math.min(ids.length - 1, Math.max(start, end));
  return [...new Set([...base, ...ids.slice(first, last + 1)])];
}
