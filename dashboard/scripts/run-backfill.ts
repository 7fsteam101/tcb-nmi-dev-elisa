import { runCloseBackfill } from "../lib/sync/backfill";

// One-shot runner: loop passes until the backfill reports finished.
const main = async () => {
  let pass = 1;
  while (true) {
    const r = await runCloseBackfill(120_000);
    console.log(`pass ${pass}: ${r.message}`);
    if (!r.ok || r.finished) break;
    pass++;
  }
  process.exit(0);
};
main().catch((e) => { console.error(e); process.exit(1); });
