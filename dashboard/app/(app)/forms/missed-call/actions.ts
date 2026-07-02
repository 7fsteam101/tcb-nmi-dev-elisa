"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { submitMissedCall } from "@/lib/forms";

export async function submitMissedCallAction(_prev: unknown, formData: FormData) {
  await requireSession();
  try {
    const result = await submitMissedCall({
      appointmentId: String(formData.get("appointmentId")),
      repId: String(formData.get("repId")),
      what: String(formData.get("what")) as never,
      reasonId: (formData.get("reasonId") as string) || undefined,
      newTime: (formData.get("newTime") as string) || undefined,
      notes: (formData.get("notes") as string) || undefined,
    });
    revalidatePath("/calls"); revalidatePath("/funnel"); revalidatePath("/overview");
    return result;
  } catch (err) {
    return { ok: false, results: [String(err instanceof Error ? err.message : err)] };
  }
}
