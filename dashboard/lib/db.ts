import postgres from "postgres";

// Single connection pool for the whole server. Uses the Supabase transaction
// pooler in production (IPv4, serverless-safe). Transaction-pooling rules:
//   prepare: false      — prepared statements are not supported in this mode
//   fetch_types: false  — the pg_type bootstrap can deadlock the pool under
//                         parallel cold queries. CONSEQUENCE: never pass a JS
//                         array as a bare parameter (`any(${arr})` breaks);
//                         use the list-fragment form `in ${sql(arr)}` instead.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

export const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL!, {
    ssl: "require",
    prepare: false,
    fetch_types: false,
    max: 6,
    idle_timeout: 20,
    max_lifetime: 60 * 5, // recycle sockets so a dropped connection cannot linger
    connect_timeout: 15,
  });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
