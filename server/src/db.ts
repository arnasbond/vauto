import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://vauto:vauto@localhost:5432/vauto",
});

export type DbClient = pg.PoolClient;

export async function query<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

/** Run work inside a single BEGIN/COMMIT (ROLLBACK on error). */
export async function runInTransaction<T>(
  fn: (client: DbClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function clientQuery<T extends pg.QueryResultRow>(
  client: DbClient,
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const res = await client.query<T>(text, params);
  return res.rows;
}
