// Warms up the Neon database connection before the Next.js server starts.
// Neon computes auto-suspend when idle and cold starts take 3-10s.
// This runs on container startup to avoid the first-request penalty
// (e.g., after a power outage when Docker auto-restarts the container).

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.log("[WARMUP] No DATABASE_URL set, skipping warmup");
  process.exit(0);
}

const start = Date.now();
console.log("[WARMUP] Waking up Neon database...");

try {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 30000,
  });
  await pool.query("SELECT 1");
  await pool.end();
  console.log(`[WARMUP] Neon database ready in ${Date.now() - start}ms`);
} catch (err) {
  // Don't block server startup if warmup fails — it'll recover on first request
  console.error(`[WARMUP] Failed after ${Date.now() - start}ms:`, err.message);
}
