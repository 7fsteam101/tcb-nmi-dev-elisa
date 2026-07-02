"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { submitSalesCall } from "@/lib/forms";

export async function submitSalesCallAction(_prev: unknown, formData: FormData) {
  const user = await requireSession();
  try {
    const result = await submitSalesCall({
      appointmentId: String(formData.get("appointmentId")),
      repId: String(formData.get("repId")),
      outcome: String(formData.get("outcome")) as never,
      disposition: (formData.get("disposition") as never) ?? undefined,
      offerMade: formData.get("offerMade") === "on",
      pricingPlanId: (formData.get("pricingPlanId") as string) || undefined,
      tcvMinor: formData.get("tcv") ? Math.round(parseFloat(String(formData.get("tcv"))) * 100) : undefined,
      firstPaymentMinor: formData.get("firstPayment") ? Math.round(parseFloat(String(formData.get("firstPayment"))) * 100) : undefined,
      dqReasonId: (formData.get("dqReasonId") as string) || undefined,
      lostReasonId: (formData.get("lostReasonId") as string) || undefined,
      objectionTypeIds: formData.getAll("objections").map(String),
      notes: (formData.get("notes") as string) || undefined,
      submittedByUserId: user.id,
    });
    revalidatePath("/overview"); revalidatePath("/calls"); revalidatePath("/funnel");
    return result;
  } catch (err) {
    return { ok: false, results: [String(err instanceof Error ? err.message : err)] };
  }
}
