"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/settings";

export type EodReportResult = { ok: boolean; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Non-negative integer from a form field; empty/invalid falls back to 0.
const count = (v: FormDataEntryValue | null): number => {
  const n = Math.floor(Number(String(v ?? "").trim()));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export async function submitEodReportAction(_prev: unknown, formData: FormData): Promise<EodReportResult> {
  const user = await requireSession();
  try {
    const isPrivileged = ["admin", "leadership"].includes(user.role);
    const repId = String(formData.get("repId") ?? "").trim();
    if (!UUID_RE.test(repId)) return { ok: false, message: "Pick a rep." };

    // Setters may only file their own report. Admin and leadership may file for any rep.
    if (!isPrivileged && user.repId !== repId) {
      return { ok: false, message: "You can only submit your own report." };
    }

    const reportDate = String(formData.get("reportDate") ?? "").trim();
    if (reportDate && !DATE_RE.test(reportDate)) return { ok: false, message: "Invalid date." };

    const demo = await isDemoMode();
    const dials = count(formData.get("dials"));
    const conversations = count(formData.get("conversations"));
    const appointmentsSet = count(formData.get("appointmentsSet"));
    const followUps = count(formData.get("followUps"));
    const notes = String(formData.get("notes") ?? "").trim() || null;

    // Upsert on (rep_id, report_date): resubmitting for a day overwrites that day's
    // numbers rather than erroring on the unique constraint.
    await sql`
      insert into sales.eod_report
        (rep_id, report_date, dials, conversations, appointments_set, follow_ups, notes, created_by_user_id, is_demo)
      values (
        ${repId},
        ${reportDate ? sql`${reportDate}::date` : sql`(now() at time zone 'America/New_York')::date`},
        ${dials}, ${conversations}, ${appointmentsSet}, ${followUps},
        ${notes ?? null}, ${user.id}, ${demo}
      )
      on conflict (rep_id, report_date) do update set
        dials = excluded.dials,
        conversations = excluded.conversations,
        appointments_set = excluded.appointments_set,
        follow_ups = excluded.follow_ups,
        notes = excluded.notes,
        created_by_user_id = excluded.created_by_user_id`;

    revalidatePath("/setter-reports");
    return { ok: true, message: "Report saved." };
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}
