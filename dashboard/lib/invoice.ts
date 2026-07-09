import { sql } from "./db";
import { scheduleFor } from "./nmi-links";

export type InvoiceLine = { no: number; dueDate: string; amountMinor: number; status: "paid" | "pending" };
export type InvoiceData = {
  invoiceNumber: string;
  issueDate: string;   // ISO yyyy-mm-dd
  dueDate: string;     // ISO yyyy-mm-dd (first installment)
  billToName: string;
  billToEmail: string;
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
    select id, amount_minor, description, customer_name, customer_email,
           frequency, installments, custom_schedule, status, token, url, created_at
    from finance.payment_link where token = ${token} limit 1`;
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
  const year = new Date(link.created_at).getUTCFullYear();

  return {
    invoiceNumber: `INV-${year}-${String(link.token).slice(0, 8).toUpperCase()}`,
    issueDate: new Date(link.created_at).toISOString().slice(0, 10),
    dueDate: schedule[0]?.dueDate ?? new Date(link.created_at).toISOString().slice(0, 10),
    billToName: link.customer_name ?? "—",
    billToEmail: link.customer_email ?? "",
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
