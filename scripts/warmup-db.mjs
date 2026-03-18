// Verifies database connection before the Next.js server starts.
// Runs on container startup via Dockerfile CMD.

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.log("[DB-CHECK] No DATABASE_URL set, skipping");
  process.exit(0);
}

const start = Date.now();
console.log("[DB-CHECK] Verifying database connection...");

try {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  await pool.query("SELECT 1");
  await pool.end();
  console.log(`[DB-CHECK] Database ready in ${Date.now() - start}ms`);
} catch (err) {
  console.error(`[DB-CHECK] Failed after ${Date.now() - start}ms:`, err.message);
}
