import "server-only";
import { runtimeDatabaseUrl } from "./database-url";
import { PrismaClient } from "@prisma/client";
import { AccessError } from "@/lib/auth/admin-access";
const CLIENT_SCHEMA_VERSION = "sales-csv-raw-v2";
const globalDb = globalThis as unknown as { prisma?: PrismaClient; url?: string; schemaVersion?: string };
export function databaseConfigured() { return Boolean(process.env.DATABASE_URL); }
export function db() {
  if (!databaseConfigured()) throw new AccessError(503, "Database storage is not configured. Add DATABASE_URL and apply the migrations.");
  let url: string;
  try { url = runtimeDatabaseUrl(process.env.DATABASE_URL!); }
  catch { throw new AccessError(503, "The database connection URL is invalid. Ask your administrator to check it."); }
  if (globalDb.url !== url || globalDb.schemaVersion !== CLIENT_SCHEMA_VERSION) {
    const old = globalDb.prisma;
    globalDb.prisma = new PrismaClient({ datasources: { db: { url } } });
    globalDb.url = url;
    globalDb.schemaVersion = CLIENT_SCHEMA_VERSION;
    if (old) void old.$disconnect().catch(() => {});
  }
  return globalDb.prisma!;
}
