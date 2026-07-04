import Link from "next/link";
import { Card } from "@/components/ui";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FORMS = [
  { href: "/forms/sales-call", title: "Sales Call Report", desc: "Log a strategy-call outcome: taken or missed, offer, close, DQ, objections. Creates the deal and pushes the result to Close." },
  { href: "/forms/missed-call", title: "Missed Call Report", desc: "No-show, cancellation, or a reschedule to a new time. Keeps the slot history intact and updates Close." },
  { href: "/forms/post-call", title: "Post-Call Notes", desc: "Notes and objections after a taken call. Posts the note to the lead in Close." },
];

export default async function FormsIndex() {
  await requireAccess("forms");
  return (
    <div>
      <h1 className="text-xl font-semibold">Forms</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        Every submission is logged, updates the reporting tables, and syncs back to Close.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {FORMS.map((f) => (
          <Link key={f.href} href={f.href}>
            <Card className="card-hover h-full">
              <div className="mb-1 font-semibold">{f.title}</div>
              <div className="text-sm" style={{ color: "var(--muted)" }}>{f.desc}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
