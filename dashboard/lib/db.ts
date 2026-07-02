import postgres from "postgres";

// Single connection pool for the whole server. Uses the Supabase transaction
// pooler in production (IPv4, serverless-safe), so prepared statements are off.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

export const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL!, {
    ssl: "require",
    prepare: false, // required in transaction-pooling mode
    fetch_types: false, // transaction pooling: the pg_type bootstrap can deadlock the pool under parallel cold queries; enums are read as strings anyway
    max: 6,
    idle_timeout: 20,
    max_lifetime: 60 * 5, // recycle sockets so one dropped connection cannot poison the pool
    connect_timeout: 15,
  });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
