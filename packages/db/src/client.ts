import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (_db) return _db;
  let url = process.env.DATABASE_URL;
  if (!url) {
    const here = dirname(fileURLToPath(import.meta.url));
    const rootEnvPath = resolve(here, "..", "..", "..", ".env");
    loadDotenv({ path: rootEnvPath });
    url = process.env.DATABASE_URL;
  }
  if (!url) throw new Error("DATABASE_URL is not set");
  _sql = postgres(url, { max: 10 });
  _db = drizzle(_sql, { schema });
  return _db;
}

export function getSql() {
  if (!_sql) getDb();
  return _sql!;
}
