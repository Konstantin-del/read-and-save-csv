import { Pool } from "pg";

let pool: Pool | null = null;

function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

export function getPool(): Pool {
  if (pool) return pool;
  pool = new Pool({
    host: getEnv("POSTGRES_HOST", ""), //127.0.0.1
    port: Number(getEnv("POSTGRES_PORT", "5432")),
    database: getEnv("POSTGRES_DB", "csvdb"),
    user: getEnv("POSTGRES_USER", "postgres"),
    password: getEnv("POSTGRES_PASSWORD", "fred"),
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

export async function ensureSchema(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`
			CREATE TABLE IF NOT EXISTS csv_rows (
				id BIGSERIAL PRIMARY KEY,
				data JSONB NOT NULL,
				ts tsvector
			);
			CREATE INDEX IF NOT EXISTS idx_csv_rows_gin ON csv_rows USING GIN (ts);
		`);
  } finally {
    client.release();
  }
}
