import postgres from "postgres";

// Single connection pool for the whole server. Uses the Supabase transaction
// pooler in production (IPv4, serverless-safe), so prepared statements are off.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

export const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL!, {
    ssl: "require",
    prepare: false, // required in transaction-pooling mode
    max: 4,
    idle_timeout: 20,
    connect_timeout: 15,
  });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
