import { NextRequest, NextResponse } from "next/server";
import { getPaymentLinkByToken } from "@/lib/nmi-links";
import { updateVaultCard, ok } from "@/lib/nmi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Card-on-file update: swap the stored card on this link's vault record. The
// vault id is unchanged, so any running installment subscription keeps charging
// the new card.
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, message: "Bad request" }, { status: 400 }); }
  const { token, paymentToken, card } = body ?? {};
  const link: any = token ? await getPaymentLinkByToken(token) : null;
  if (!link) return NextResponse.json({ ok: false, message: "Link not found" }, { status: 404 });
  if (!link.nmi_customer_vault_id) return NextResponse.json({ ok: false, message: "No card on file to update for this link." }, { status: 409 });

  const source = paymentToken ? { paymentToken } : card ? { ccnumber: card.ccnumber, ccexp: card.ccexp, cvv: card.cvv } : null;
  if (!source) return NextResponse.json({ ok: false, message: "No card provided." }, { status: 400 });

  const res = await updateVaultCard({ vaultId: link.nmi_customer_vault_id, source });
  if (!ok(res)) return NextResponse.json({ ok: false, message: res.responsetext || "Could not update the card." }, { status: 402 });
  return NextResponse.json({ ok: true, message: "Your card on file has been updated." });
}
