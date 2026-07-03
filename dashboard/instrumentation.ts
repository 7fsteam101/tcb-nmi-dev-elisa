// Runs once per server instance, before requests are handled (Next 16
// instrumentation convention).
//
// Why this exists: the transaction pooler occasionally kills idle sockets,
// which can reject SEVERAL in-flight parallel queries at once. Promise.all
// surfaces only the first rejection; the siblings become unhandledRejections,
// and on Vercel an unhandled rejection CRASHES the function ("An error
// occurred with your deployment"). This turns that crash into a logged,
// request-scoped error — the query's own catch/retry paths still run.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.on("unhandledRejection", (reason) => {
      console.error("[unhandledRejection]", reason instanceof Error ? reason.message : String(reason));
    });
  }
}
