import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { checkCronSecret } from "@/lib/webhook";

export const maxDuration = 60;

// Diagnostic battery: runs the query shapes the pages use and RETURNS raw
// errors (Vercel log streaming is unreliable). CRON_SECRET-gated.
export async function GET(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;
  const results: Record<string, string> = {};
  const t0 = Date.now();

  const attempt = async (name: string, fn: () => Promise<unknown>) => {
    const t = Date.now();
    try {
      await fn();
      results[name] = `ok ${Date.now() - t}ms`;
    } catch (err) {
      results[name] = `ERROR: ${String(err).slice(0, 300)}`;
    }
  };

  await attempt("simple", () => sql`select 1 as one`);
  await attempt("enum_result", () => sql`select stage from sales.opportunity limit 3`);
  await attempt("list_fragment", () => sql`select count(*) from sales.opportunity where stage in ${sql(["lost", "closed_won"])}`);
  await attempt("in_fragment", () => sql`select count(*) from sales.opportunity where stage not in ${sql(["lost", "dq_on_call"])}`);
  await attempt("bool_param", () => sql`select count(*) from sales.call where is_demo = ${false}`);
  // parallel probe kept modest: an 8-way burst on one instance is a self-DOS
  // (pooler serializes cold handshakes); 3-way with a local race is the canary.
  await attempt("parallel_3", () => Promise.race([
    Promise.all([
      sql`select count(*) from core.contact`,
      sql`select count(*) from sales.opportunity`,
      sql`select count(*) from sales.deal`,
    ]),
    new Promise((_, rej) => setTimeout(() => rej(new Error("parallel probe exceeded 10s")), 10_000)),
  ]));
  await attempt("app_setting", () => sql`select value from core.app_setting where key = ${"demo_mode"}`);

  return NextResponse.json({ ok: true, total_ms: Date.now() - t0, results });
}
