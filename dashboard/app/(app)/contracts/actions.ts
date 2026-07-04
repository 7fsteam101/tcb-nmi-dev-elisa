"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";

// The statuses a person can move an agreement to from the row updater. The full
// column enum also allows 'draft' and 'declined', but the writable control only
// exposes these three deliberate transitions (mark it landed, mark it out for
// signature, or void it). Whitelisted here so nothing else reaches the update.
const ALLOWED = ["signed", "sent", "voided"] as const;
type AllowedStatus = (typeof ALLOWED)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Editing an agreement's status is a leadership/admin action. Setters and
// closers see the page (gate 'reps') but cannot mutate rows.
export async function setAgreementStatusAction(id: string, status: string) {
  const user = await requireSession();
  if (user.role !== "admin" && user.role !== "leadership") {
    return { ok: false, message: "Leadership only" };
  }
  if (!UUID.test(id)) return { ok: false, message: "Invalid agreement" };
  if (!ALLOWED.includes(status as AllowedStatus)) {
    return { ok: false, message: "Unsupported status" };
  }
  const next = status as AllowedStatus;

  // Stamp the matching timestamp on the transition, but never clobber a stamp
  // that already exists: coalesce keeps the original signed_at / sent_at if the
  // row was already there. Voiding clears neither timestamp (it just records the
  // status), so the audit trail of when it went out / was signed survives.
  if (next === "signed") {
    await sql`
      update sales.agreement
      set status = 'signed',
          signed_at = coalesce(signed_at, now()),
          sent_at = coalesce(sent_at, now()),
          updated_at = now()
      where id = ${id}`;
  } else if (next === "sent") {
    await sql`
      update sales.agreement
      set status = 'sent',
          sent_at = coalesce(sent_at, now()),
          updated_at = now()
      where id = ${id}`;
  } else {
    await sql`
      update sales.agreement
      set status = 'voided',
          updated_at = now()
      where id = ${id}`;
  }

  revalidatePath("/contracts");
  return { ok: true, message: `Marked ${next}` };
}
