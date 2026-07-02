"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { submitSalesCall, type CallResult, type FollowUpInput } from "@/lib/forms";

const money = (v: FormDataEntryValue | null) =>
  v && String(v).trim() !== "" ? Math.round(parseFloat(String(v)) * 100) : undefined;

export async function submitSalesCallAction(_prev: unknown, formData: FormData) {
  const user = await requireSession();
  try {
    const callResult = (formData.get("callResult") as CallResult) || undefined;
    const followUpWanted = formData.get("followUpWanted");
    const followUp: FollowUpInput | undefined = followUpWanted === null ? undefined : {
      wanted: followUpWanted === "yes",
      date: (formData.get("followUpDate") as string) || undefined,
      assigneeRepId: (formData.get("followUpAssignee") as string) || undefined,
      whyNot: (formData.get("followUpWhyNot") as string) || undefined,
    };
    let customInstallments: { amountMinor: number; date: string }[] | undefined;
    const rowsRaw = formData.get("customInstallments");
    if (rowsRaw && String(rowsRaw).trim()) {
      customInstallments = JSON.parse(String(rowsRaw)).map((r: { amount: string; date: string }) => ({
        amountMinor: Math.round(parseFloat(r.amount) * 100),
        date: r.date,
      })).filter((r: { amountMinor: number; date: string }) => r.amountMinor > 0 && r.date);
    }
    const result = await submitSalesCall({
      appointmentId: String(formData.get("appointmentId")),
      repId: String(formData.get("repId")),
      outcome: "taken",
      callResult,
      offerMade: formData.get("offerMade") === "on",
      dealType: (formData.get("dealType") as never) || undefined,
      amountContractedMinor: money(formData.get("amountContracted")),
      cashCollectedMinor: money(formData.get("cashCollected")),
      pricingPlanId: (formData.get("pricingPlanId") as string) || undefined,
      planStartDate: (formData.get("startDate") as string) || undefined,
      cadence: (formData.get("cadence") as never) || undefined,
      customInstallments,
      expectedCloseDate: (formData.get("expectedCloseDate") as string) || undefined,
      qualified: formData.get("qualified") === null ? undefined : formData.get("qualified") === "yes",
      dqReasonId: (formData.get("dqReasonId") as string) || undefined,
      lostReasonId: (formData.get("lostReasonId") as string) || undefined,
      mainObjectionId: (formData.get("mainObjectionId") as string) || undefined,
      followUp,
      notes: (formData.get("notes") as string) || undefined,
      submittedByUserId: user.id,
    });
    revalidatePath("/overview"); revalidatePath("/calls"); revalidatePath("/funnel"); revalidatePath("/receivables");
    return result;
  } catch (err) {
    return { ok: false, results: [String(err instanceof Error ? err.message : err)] };
  }
}
