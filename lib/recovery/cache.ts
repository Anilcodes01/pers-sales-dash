// Per-server-instance cache. Every caller must authorize before using this cache.
const values = new Map<string, { expires: number; value: Promise<unknown> }>();
export function cachedRecovery<T>(key: string, ttl: number, load: () => Promise<T>, fresh = false): Promise<T> {
  const old = values.get(key);
  if (!fresh && old && old.expires > Date.now()) return old.value as Promise<T>;
  const value = load();
  const entry = { expires: Date.now() + ttl, value };
  values.set(key, entry);
  if (values.size > 1000) for (const [key, row] of values) if (row.expires < Date.now()) values.delete(key);
  while (values.size > 1000) values.delete(values.keys().next().value!);
  void value.catch(() => { if (values.get(key) === entry) values.delete(key); });
  return value;
}
export function invalidateRecoveryCache(prefix: string) {
  for (const key of values.keys()) if (key.startsWith(prefix)) values.delete(key);
}
