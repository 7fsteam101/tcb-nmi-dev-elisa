import postgres from "postgres";

// Single connection pool for the whole server, over the Supabase transaction
// pooler (IPv4, serverless-safe). Hard-won rules encoded here:
//
//   prepare: false      transaction pooling does not support prepared statements
//   fetch_types: false  the pg_type bootstrap can deadlock the pool under
//                       parallel cold queries. CONSEQUENCE: never pass a JS
//                       array as a bare parameter (`any(${arr})` breaks) —
//                       use the list-fragment form `in ${sql(arr)}` instead.
//   keep_alive: 20      the pooler sometimes half-closes idle sockets (no FIN);
//                       without TCP keepalive such a zombie hangs its next
//                       query forever. Keepalive surfaces it as a fast,
//                       retryable connection error instead.
//   max: 4              a Vercel instance can serve a few concurrent requests
//                       (the app shell + page each issue queries); max:1
//                       gridlocks them on one connection. 4 is the balance:
//                       enough headroom per warm instance, still bounded against
//                       the shared pooler. Real single-user traffic never bursts
//                       hard enough to matter; this only shapes worst case.
//   NEVER wrap `sql` in a Proxy — postgres.js fragment embedding breaks
//   (NOT_TAGGED_CALL), proven twice. Unhandled-rejection protection lives in
//   instrumentation.ts instead.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

export const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL!, {
    ssl: "require",
    prepare: false,
    fetch_types: false,
    max: 4,
    idle_timeout: 5, // release pooler slots fast so idle warm instances do not hoard the free-tier connection cap
    max_lifetime: 60 * 5,
    connect_timeout: 15,
    keep_alive: 20,
    // server-side backstop: no single statement legitimately runs this long, so
    // a stuck query aborts here (retryable error) instead of hanging to the
    // 60s gateway limit. Frees the connection immediately.
    connection: { statement_timeout: 20000 },
  });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
