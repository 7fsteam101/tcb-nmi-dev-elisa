import { getPortalFeatures } from "@/lib/portal";
import { getPortalSession } from "@/lib/portal-auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./form";

export const dynamic = "force-dynamic";

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ prefilled_email?: string }>;
}) {
  // already signed in? go straight to the portal
  if (await getPortalSession()) redirect("/portal");

  const { prefilled_email } = await searchParams;
  const f = await getPortalFeatures();
  // Guard the brand accent, then apply it directly (never as a "--accent" custom
  // property in a Server Component style object — that serialization throws
  // "Zero-length key is not supported").
  const accent = f.brandAccent && f.brandAccent.trim() ? f.brandAccent : "#3b82f6";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b0f17",
        color: "#e8edf5",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", fontWeight: 800, letterSpacing: 0.5, fontSize: 15, marginBottom: 18 }}>
          {f.brandName.toUpperCase()}
        </div>
        <div style={{ background: "#131a26", border: "1px solid #223049", borderRadius: 16, padding: 28 }}>
          <h1 style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>Sign in to your billing portal</h1>
          <p style={{ color: "#8aa0bd", fontSize: 13, marginBottom: 20 }}>
            Enter your email and we&apos;ll send you a one-time code.
          </p>
          <LoginForm prefilledEmail={prefilled_email ?? ""} accent={accent} />
        </div>
      </div>
    </main>
  );
}
