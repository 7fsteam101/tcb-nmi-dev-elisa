import { sql } from "./db";

// Call Logs page queries. Everything reads CURRENT appointment slots (per-slot
// model: each reschedule spawns a new immutable-history row; is_current marks
// the live one). "Pending" = a current slot whose scheduled_for is in the past
// but whose status is still scheduled/confirmed — attendance was never marked.
// The range window is scheduled_for >= now() - days, so future slots are
// always included ("Scheduled") and past slots bucket by their outcome.

export type CallLogSummary = {
  scheduled: number;
  pending: number;
  cancelled_by_lead: number;
  cancelled_by_team: number;
  taken: number;
  no_show: number;
};

export type CallLogRow = {
  appointment_id: string;
  created_at: string | Date;
  scheduled_for: string | Date;
  seq: number;
  status: string;
  needs_attendance: boolean;
  contact_id: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  rep_id: string | null;
  closer: string | null;
  stage: string | null;
  booking_source: string | null;
  cancellation_reason: string | null;
};

export type CloserOption = { id: string; full_name: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 'pending' is a virtual filter (past + scheduled/confirmed); the rest match
// the appointment_status enum exactly. Anything else is ignored.
const FILTERABLE_STATUSES = [
  "pending", "scheduled", "confirmed", "taken", "no_show",
  "cancelled_by_lead", "cancelled_by_team", "rescheduled",
];

export async function callLogSummary({ demo, days }: { demo: boolean; days: number }): Promise<CallLogSummary> {
  const [row] = await sql<CallLogSummary[]>`
    select
      count(*) filter (where a.status in ('scheduled','confirmed') and a.scheduled_for > now())::int as scheduled,
      count(*) filter (where a.status in ('scheduled','confirmed') and a.scheduled_for <= now())::int as pending,
      count(*) filter (where a.status = 'cancelled_by_lead')::int as cancelled_by_lead,
      count(*) filter (where a.status = 'cancelled_by_team')::int as cancelled_by_team,
      count(*) filter (where a.status = 'taken')::int as taken,
      count(*) filter (where a.status = 'no_show')::int as no_show
    from sales.appointment a
    where a.is_demo = ${demo} and a.is_current
      and a.scheduled_for >= now() - make_interval(days => ${days})`;
  return row;
}

export async function callLogRows({ demo, days, q, closerId, status }: {
  demo: boolean; days: number; q?: string; closerId?: string; status?: string;
}): Promise<CallLogRow[]> {
  const pattern = q?.trim() ? `%${q.trim()}%` : null;
  const closer = closerId && UUID_RE.test(closerId) ? closerId : null;
  const st = status && FILTERABLE_STATUSES.includes(status) ? status : null;
  return sql<CallLogRow[]>`
    select a.id as appointment_id, a.created_at, a.scheduled_for, a.seq, a.status,
           (a.status in ('scheduled','confirmed') and a.scheduled_for <= now()) as needs_attendance,
           ct.id as contact_id, ct.full_name as contact_name, ct.primary_email as contact_email,
           ct.primary_phone as contact_phone,
           rep.id as rep_id, rep.full_name as closer,
           o.stage as stage, c.booking_source_channel as booking_source,
           cr.name as cancellation_reason
    from sales.appointment a
    join sales.call c on c.id = a.call_id
    join sales.opportunity o on o.id = c.opportunity_id
    join core.contact ct on ct.id = o.contact_id
    left join sales.rep rep on rep.id = c.rep_id
    left join core.cancellation_reason cr on cr.id = a.reason_id
    where a.is_demo = ${demo} and a.is_current
      and a.scheduled_for >= now() - make_interval(days => ${days})
      and (${pattern}::text is null or ct.full_name ilike ${pattern} or ct.primary_email ilike ${pattern})
      and (${closer}::uuid is null or c.rep_id = ${closer}::uuid)
      and (${st}::text is null
           or (${st}::text = 'pending' and a.status in ('scheduled','confirmed') and a.scheduled_for <= now())
           or (${st}::text <> 'pending' and a.status::text = ${st}))
    order by a.scheduled_for desc
    limit 200`;
}

// Reps that actually appear as the closer on a current slot (includes
// deactivated reps so historical rows stay filterable).
export async function closerOptions(demo: boolean): Promise<CloserOption[]> {
  return sql<CloserOption[]>`
    select distinct rep.id, rep.full_name
    from sales.rep rep
    join sales.call c on c.rep_id = rep.id
    join sales.appointment a on a.call_id = c.id and a.is_current
    where a.is_demo = ${demo}
    order by rep.full_name`;
}
