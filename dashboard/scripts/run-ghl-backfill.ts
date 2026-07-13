import { syncAllGhl } from "../lib/sync/ghl";
const res = await syncAllGhl({ sinceDays: 365 });
console.log("GHL BACKFILL RESULT:", JSON.stringify(res, null, 1));
process.exit(0);
