import { sql } from "./db";
import { scheduleFor } from "./nmi-links";

export type InvoiceLine = { no: number; dueDate: string; amountMinor: number; status: "paid" | "pending" };
export type InvoiceData = {
  invoiceNumber: string;
  issueDate: string;   // ISO yyyy-mm-dd
  dueDate: string;     // ISO yyyy-mm-dd (first installment)
  billToName: string;
  billToEmail: string;
  billToPhone: string;
  itemDescription: string;
  totalMinor: number;
  paidMinor: number;
  dueMinor: number;
  isPlan: boolean;
  frequency: string | null;
  schedule: InvoiceLine[];
  payUrl: string;
  status: string;
};

/**
 * Assemble everything the invoice PDF needs for a payment link, from our own DB
 * (no NMI call). Paid/pending is truthful for one-time links and custom plans;
 * for fixed NMI-subscription plans only installment #1 is known here (the rest
 * live in NMI), so they render as pending until reconciled — a known limit.
 */
export async function getInvoiceData(token: string): Promise<InvoiceData | null> {
  const [link]: any = await sql`
    select pl.id, pl.amount_minor, pl.description, pl.customer_name, pl.customer_email,
           pl.frequency, pl.installments, pl.custom_schedule, pl.status, pl.token, pl.url, pl.created_at,
           c.full_name as contact_name, c.primary_email as contact_email, c.primary_phone as contact_phone
    from finance.payment_link pl
    left join core.contact c on c.id = pl.contact_id
    where pl.token = ${token} limit 1`;
  if (!link) return null;

  const sched = scheduleFor(link); // [{ no, dueDate, amountMinor }]
  const custom: any[] | null =
    Array.isArray(link.custom_schedule) && link.custom_schedule.length ? link.custom_schedule : null;

  const schedule: InvoiceLine[] = sched.map((s, i) => {
    const paid = custom ? custom[i]?.status === "paid" : link.status === "paid" && i === 0;
    return { no: s.no, dueDate: s.dueDate, amountMinor: s.amountMinor, status: paid ? "paid" : "pending" };
  });

  const totalMinor = link.amount_minor as number;
  const paidMinor = schedule.filter((s) => s.status === "paid").reduce((a, s) => a + s.amountMinor, 0);
  const issued = new Date(link.created_at);
  const due = new Date(issued);
  due.setUTCDate(due.getUTCDate() + 3); // invoice due date = issue date + 3 days

  return {
    invoiceNumber: `INV-${issued.getUTCFullYear()}-${String(link.token).slice(0, 8).toUpperCase()}`,
    issueDate: issued.toISOString().slice(0, 10),
    dueDate: due.toISOString().slice(0, 10),
    billToName: link.contact_name ?? link.customer_name ?? "—",
    billToEmail: link.contact_email ?? link.customer_email ?? "",
    billToPhone: link.contact_phone ?? "",
    itemDescription: link.description ?? "Payment",
    totalMinor,
    paidMinor,
    dueMinor: Math.max(0, totalMinor - paidMinor),
    isPlan: (link.installments ?? 1) > 1 || !!custom,
    frequency: link.frequency ?? null,
    schedule,
    payUrl: link.url,
    status: link.status,
  };
}
