import { getPaymentLinkByToken } from "@/lib/nmi-links";
import { nmiTestMode } from "@/lib/nmi";
import { Checkout } from "../checkout";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Card-on-file update page: the customer swaps the card their installment plan
// charges. Reuses the checkout card form, posting to /api/update-card.
export default async function CardUpdatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link: any = await getPaymentLinkByToken(token);
  const testMode = await nmiTestMode();
  const tokenizationKey = process.env.NEXT_PUBLIC_NMI_TOKENIZATION_KEY || "";

  const shell = (children: React.ReactNode) => (
    <main style={{ minHeight: "100vh", background: "#0b0f17", color: "#e8edf5", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ textAlign: "center", marginBottom: 18, fontWeight: 800, letterSpacing: 0.5, fontSize: 15 }}>THE CREDIT BROTHERS</div>
        <div style={{ background: "#131a26", border: "1px solid #223049", borderRadius: 16, padding: 28 }}>{children}</div>
      </div>
    </main>
  );

  if (!link || !link.nmi_customer_vault_id)
    return shell(<div><h1 style={{ fontSize: 20, fontWeight: 700 }}>No card on file</h1><p style={{ color: "#8aa0bd", marginTop: 8 }}>There is no active card to update for this link.</p></div>);

  return shell(
    <>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Update card on file</h1>
      <p style={{ color: "#8aa0bd", marginTop: 6, fontSize: 14 }}>Enter a new card. Your remaining scheduled payments will charge to it.</p>
      <Checkout token={token} firstAmountLabel="" defaultName={link.customer_name || ""} defaultEmail={link.customer_email || ""}
        tokenizationKey={tokenizationKey} testMode={testMode} action="/api/update-card" payLabel="Update card" requireContact={false} collectZip={false} />
    </>
  );
}
