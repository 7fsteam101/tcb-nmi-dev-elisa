import Link from "next/link";
import { Icon } from "@/components/icons";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FORMS = [
  {
    href: "/forms/sales-call",
    icon: "forms",
    title: "Sales Call Report",
    desc: "Log a strategy-call outcome: taken or missed, offer, close, DQ, and objections. Creates the deal and pushes the result to Close.",
    tags: ["Deal creation", "Objections", "Follow-up"],
  },
  {
    href: "/forms/missed-call",
    icon: "calls",
    title: "Missed Call Report",
    desc: "No-show, cancellation, or a reschedule to a new time. Keeps the slot history intact so leakage stays measurable, and updates Close.",
    tags: ["No-show", "Reschedule", "Leakage"],
  },
  {
    href: "/forms/post-call",
    icon: "knowledge",
    title: "Post-Call Notes",
    desc: "Notes and objections after a taken call. Posts the note to the lead in Close so the record stays complete.",
    tags: ["Notes", "Objections", "Close sync"],
  },
];

const tint = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${pct}%, transparent)`;

export default async function FormsIndex() {
  await requireAccess("forms");
  return (
    <div>
      <div className="mb-7 flex items-start gap-3.5">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: tint("--accent", 14), color: "var(--accent)", border: `1px solid ${tint("--accent", 30)}` }}
        >
          <Icon name="forms" size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Forms</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
            Log call outcomes and notes. Every submission is recorded, updates the reporting tables, and syncs back to Close.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {FORMS.map((f) => (
          <Link key={f.href} href={f.href} className="group block">
            <div className="card card-hover flex h-full flex-col p-5 transition-transform group-hover:-translate-y-0.5">
              <div
                className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ background: tint("--accent", 12), color: "var(--accent)" }}
              >
                <Icon name={f.icon} size={18} />
              </div>
              <div className="mb-1.5 text-[15px] font-semibold">{f.title}</div>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--muted)" }}>{f.desc}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {f.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ background: "var(--panel-2)", color: "var(--muted)", border: "1px solid var(--line)" }}
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div
                className="mt-5 flex items-center gap-1.5 text-[13px] font-medium transition-colors"
                style={{ color: "var(--accent)" }}
              >
                Open form
                <span className="transition-transform group-hover:translate-x-0.5">
                  <Icon name="link" size={14} />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
