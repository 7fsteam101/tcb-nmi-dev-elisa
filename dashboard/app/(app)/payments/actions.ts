"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createPaymentLink } from "@/lib/nmi-links";

export async function createPaymentLinkAction(_prev: unknown, formData: FormData) {
  const user = await requireSession();
  if (!["admin", "leadership", "closer"].includes(user.role))
    return { ok: false, message: "Not allowed" };
  const amount = formData.get("amount") ? Math.round(parseFloat(String(formData.get("amount"))) * 100) : 0;
  const result = await createPaymentLink({
    amountMinor: amount,
    description: (formData.get("description") as string) || undefined,
    customerName: (formData.get("customerName") as string) || undefined,
    customerEmail: (formData.get("customerEmail") as string) || undefined,
  }, user.id);
  revalidatePath("/payments");
  return result;
}
