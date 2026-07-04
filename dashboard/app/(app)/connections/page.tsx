import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { listConnections } from "@/lib/sync/providers";
import { Card, SectionTitle, Badge, STATUS_TONE, label } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { KeyForm } from "./key-form";
import { BackfillButton } from "./backfill-button";
import { GhlControls } from "./ghl-controls";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Connections() {
  const user = await requireSession();
  if (user.role !== "admin") redirect("/overview");
  const [connections, queue, events] = await Promise.all([
    listConnections(),
    sql`select status, count(*) as n from sync.writeback_queue group by status`,
    sql`select provider, status, count(*) as n from sync.raw_events group by provider, status order by provider`,
  ]);
  const h = await headers();
  const base = `https://${h.get("host") ?? "your-app.vercel.app"}`;
  const hook = (p: string) => `${base}/api/webhooks/${p}?secret=<WEBHOOK_SECRET>`;

  return (
    <div>
      <h1 className="text-xl font-semibold">Connections</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        One row per connected account. Adding an account later is just another connection — no code changes.
      </p>

      <SectionTitle>Connected accounts</SectionTitle>
      <Card>
        <table>
          <thead><tr><th>Provider</th><th>Account</th><th>Status</th><th>Last synced</th><th>Last error</th></tr></thead>
          <tbody>
            {connections.map((c: any) => (
              <tr key={c.id}>
                <td className="uppercase">{c.provider}</td>
                <td>{c.account_label ?? c.external_account_id}</td>
                <td><Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{label(c.status)}</Badge></td>
                <td>{c.last_synced_at ? dateTime(c.last_synced_at) : "—"}</td>
                <td className="max-w-60 truncate" style={{ color: "var(--muted)" }}>{c.last_error ?? "—"}</td>
              </tr>
            ))}
            {connections.length === 0 && <tr><td colSpan={5} style={{ color: "var(--muted)" }}>Nothing connected yet — start below</td></tr>}
          </tbody>
        </table>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <SectionTitle>Connect with a key</SectionTitle>
          <Card><KeyForm /></Card>
          <SectionTitle>Close history</SectionTitle>
          <Card>
            <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
              Imports every historical lead and opportunity from Close (needs the Close key above).
              Safe to run again any time — records update in place, nothing duplicates.
            </p>
            <BackfillButton />
          </Card>
          <SectionTitle>GoHighLevel</SectionTitle>
          <Card>
            <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
              One Marketplace app, one connection per sub-account. Install pulls calendars, bookings
              (with full reschedule history), contacts, and opt-in form submissions — then categorize the
              calendars in Admin, Calendars.
            </p>
            <GhlControls appRegistered={Boolean(process.env.GHL_CLIENT_ID)} />
          </Card>
        </div>
        <div>
          <SectionTitle>Sync health</SectionTitle>
          <Card>
            <div className="mb-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>Write-back queue (dashboard to Close/GHL)</div>
            {queue.length === 0 && <div className="text-sm" style={{ color: "var(--muted)" }}>Empty</div>}
            <div className="flex gap-2">
              {queue.map((q: any) => <Badge key={q.status} tone={STATUS_TONE[q.status] ?? "neutral"}>{`${label(q.status)}: ${q.n}`}</Badge>)}
            </div>
            <div className="mb-2 mt-4 text-xs font-semibold" style={{ color: "var(--muted)" }}>Inbound events</div>
            {events.length === 0 && <div className="text-sm" style={{ color: "var(--muted)" }}>No events received yet</div>}
            <div className="flex flex-wrap gap-2">
              {events.map((e: any, i: number) => (
                <Badge key={i} tone={e.status === "processed" ? "good" : e.status === "failed" ? "bad" : "warn"}>
                  {`${e.provider} ${label(e.status)}: ${e.n}`}
                </Badge>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <SectionTitle>Inbound webhook URLs</SectionTitle>
      <Card>
        <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
          Paste these where each system sends events. Replace the secret placeholder with the value of WEBHOOK_SECRET.
        </p>
        <table>
          <tbody>
            <tr><td className="font-semibold">Close</td><td><code className="text-xs">{hook("close")}</code></td>
              <td style={{ color: "var(--muted)" }}>Webhook subscription on lead + opportunity events</td></tr>
            <tr><td className="font-semibold">GHL (both sub-accounts)</td><td><code className="text-xs">{hook("ghl")}</code></td>
              <td style={{ color: "var(--muted)" }}>Workflow custom-webhook action; send the tcb_event envelope</td></tr>
            <tr><td className="font-semibold">Stripe</td><td><code className="text-xs">{hook("stripe")}</code></td>
              <td style={{ color: "var(--muted)" }}>Event destination for charge.succeeded (the $25)</td></tr>
            <tr><td className="font-semibold">NMI</td><td><code className="text-xs">{hook("nmi")}</code></td>
              <td style={{ color: "var(--muted)" }}>Silent post / webhook for approved payments</td></tr>
          </tbody>
        </table>
      </Card>

      <SectionTitle>How each connection works</SectionTitle>
      <Card>
        <ul className="list-disc space-y-1.5 pl-5 text-sm" style={{ color: "var(--muted)" }}>
          <li><span style={{ color: "var(--text)" }}>Close:</span> paste an API key above (Settings, then API Keys in Close). Inbound webhooks + write-backs (stage, notes) both use it.</li>
          <li><span style={{ color: "var(--text)" }}>GoHighLevel:</span> inbound events flow today via workflow webhooks from each sub-account. Write-back needs the Marketplace app token (OAuth) — one agency install, then each sub-account is its own connection.</li>
          <li><span style={{ color: "var(--text)" }}>Stripe:</span> add the webhook URL as an event destination in the Stripe dashboard.</li>
          <li><span style={{ color: "var(--text)" }}>NMI:</span> paste the security key, and set the silent-post URL in the NMI gateway.</li>
          <li><span style={{ color: "var(--text)" }}>Meta:</span> paste a system-user access token; the daily puller starts on the next run. Set the ad account id in Vercel env (META_AD_ACCOUNT_ID).</li>
        </ul>
      </Card>
    </div>
  );
}
