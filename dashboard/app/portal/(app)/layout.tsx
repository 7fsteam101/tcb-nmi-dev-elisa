import { redirect } from "next/navigation";
import Link from "next/link";
import { getPortalSession } from "@/lib/portal-auth";
import { getPortalFeatures } from "@/lib/portal";

export const dynamic = "force-dynamic";

// Protected shell. Any request without a valid portal session cookie is bounced
// to /portal/login. (The login route lives in the (auth) group, NOT under this
// layout, so there's no redirect loop.)
export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalSession();
  if (!session) redirect("/portal/login");
  const f = await getPortalFeatures();

  const nav: { href: string; label: string }[] = [{ href: "/portal", label: "Billing" }];
  if (f.showPaymentMethods) nav.push({ href: "/portal#payment-methods", label: "Payment methods" });
  if (f.editBusinessInfo) nav.push({ href: "/portal/account", label: "Account" });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b0f17",
        color: "#e8edf5",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid #223049",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          maxWidth: 880,
          margin: "0 auto",
        }}
      >
        <div style={{ fontWeight: 800, letterSpacing: 0.5, fontSize: 15 }}>{f.brandName.toUpperCase()}</div>
        <nav style={{ display: "flex", gap: 16, fontSize: 13, alignItems: "center" }}>
          {nav.map((n) => (
            <Link key={n.label} href={n.href} style={{ color: "#8aa0bd", textDecoration: "none" }}>
              {n.label}
            </Link>
          ))}
          <a href="/portal/logout" style={{ color: "#8aa0bd", textDecoration: "none" }}>
            Sign out
          </a>
        </nav>
      </header>
      <main style={{ maxWidth: 880, margin: "0 auto", padding: "24px 20px 64px" }}>{children}</main>
    </div>
  );
}
