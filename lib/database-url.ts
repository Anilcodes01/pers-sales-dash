/** Prisma 6 needs PgBouncer compatibility when using Supabase's transaction pooler. */
export function runtimeDatabaseUrl(value: string) {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid database protocol.");
  if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") {
    url.searchParams.set("pgbouncer", "true");
  }
  return url.toString();
}
