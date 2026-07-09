import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { AdminTab } from "./tabs";

const TABS = [
  { href: "/admin/users", label: "Users & Access" },
  { href: "/admin/options", label: "Form Options" },
  { href: "/admin/team", label: "Team" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/pricing", label: "Offers & Pricing" },
  { href: "/admin/calendars", label: "Calendars" },
  { href: "/admin/stages", label: "Stages" },
  { href: "/admin/plans", label: "Payment Plans" },
  { href: "/admin/goals", label: "Goals" },
  { href: "/admin/commission", label: "Commission" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  if (user.role !== "admin") redirect("/overview");
  return (
    <div>
      <h1 className="text-xl font-semibold">Admin</h1>
      <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
        Everything here changes the live system — form dropdowns, team, pricing, calendar categorization, payment plans.
      </p>
      <div className="mb-6 flex gap-1 border-b pb-2" style={{ borderColor: "var(--line)" }}>
        {TABS.map((t) => <AdminTab key={t.href} href={t.href} label={t.label} />)}
      </div>
      {children}
    </div>
  );
}
