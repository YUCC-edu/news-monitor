import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = resolve(here, "..", "drizzle");
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);
  console.log(`[migrate] running from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log("[migrate] done");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
