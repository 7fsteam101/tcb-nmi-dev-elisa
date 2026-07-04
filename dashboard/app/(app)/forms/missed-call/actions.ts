"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { submitMissedCall, type FollowUpInput } from "@/lib/forms";

export async function submitMissedCallAction(_prev: unknown, formData: FormData) {
  await requireSession();
  try {
    const followUpWanted = formData.get("followUpWanted");
    const followUp: FollowUpInput | undefined = followUpWanted === null ? undefined : {
      wanted: followUpWanted === "yes",
      date: (formData.get("followUpDate") as string) || undefined,
      assigneeRepId: (formData.get("followUpAssignee") as string) || undefined,
      whyNot: (formData.get("followUpWhyNot") as string) || undefined,
    };
    const movedBy: "closer" | "lead_link" =
      formData.get("movedBy") === "lead_link" ? "lead_link" : "closer";
    const result = await submitMissedCall({
      appointmentId: String(formData.get("appointmentId")),
      repId: String(formData.get("repId")),
      what: String(formData.get("what")) as never,
      reasonId: (formData.get("reasonId") as string) || undefined,
      dqReasonId: (formData.get("dqReasonId") as string) || undefined,
      newTime: (formData.get("newTime") as string) || undefined,
      movedBy,
      followUp,
      notes: (formData.get("notes") as string) || undefined,
    });
    revalidatePath("/calls"); revalidatePath("/funnel"); revalidatePath("/overview");
    return result;
  } catch (err) {
    return { ok: false, results: [String(err instanceof Error ? err.message : err)] };
  }
}
