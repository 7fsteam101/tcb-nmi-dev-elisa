"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { submitSalesCall, submitMissedCall } from "@/lib/forms";

// One-click attendance marking from the Call Logs table. Both actions run the
// SAME pipeline as the rep forms (lib/forms): a report_submission row lands
// and the Close/GHL write-backs fire exactly like a manually filed report.
// "Show up" files a minimal taken report (no_decision, no offer) — the closer
// still files the full Sales Call Report, which supersedes this one.

type ActionResult = { ok: boolean; results: string[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Outcomes need a rep to attribute: use the call's assigned closer; when the
// call has no rep yet, fall back to an active rep, preferring admins.
async function resolveRepId(appointmentId: string): Promise<string> {
  if (!UUID_RE.test(appointmentId)) throw new Error("Invalid appointment id");
  const [appt] = await sql`
    select c.rep_id
    from sales.appointment a
    join sales.call c on c.id = a.call_id
    where a.id = ${appointmentId}`;
  if (!appt) throw new Error("Appointment not found");
  if (appt.rep_id) return appt.rep_id as string;
  const [fallback] = await sql`
    select id from sales.rep where active order by (role = 'admin') desc limit 1`;
  if (!fallback) throw new Error("No active rep to attribute this outcome to — add one under Admin");
  return fallback.id as string;
}

function refresh() {
  revalidatePath("/calls");
  revalidatePath("/overview");
  revalidatePath("/funnel");
}

export async function markShowAction(appointmentId: string): Promise<ActionResult> {
  const user = await requireSession();
  try {
    const result = await submitSalesCall({
      appointmentId,
      repId: await resolveRepId(appointmentId),
      outcome: "taken",
      disposition: "no_decision",
      offerMade: false,
      objectionTypeIds: [],
      submittedByUserId: user.id,
    });
    refresh();
    return result;
  } catch (err) {
    return { ok: false, results: [String(err instanceof Error ? err.message : err)] };
  }
}

export async function markNoShowAction(appointmentId: string): Promise<ActionResult> {
  await requireSession();
  try {
    const repId = await resolveRepId(appointmentId);
    const result = await submitMissedCall({ appointmentId, repId, what: "no_show" });
    refresh();
    return result;
  } catch (err) {
    return { ok: false, results: [String(err instanceof Error ? err.message : err)] };
  }
}
