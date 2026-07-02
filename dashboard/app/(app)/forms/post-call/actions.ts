"use server";

import { requireSession } from "@/lib/auth";
import { submitPostCall } from "@/lib/forms";

export async function submitPostCallAction(_prev: unknown, formData: FormData) {
  await requireSession();
  try {
    return await submitPostCall({
      callId: String(formData.get("callId")),
      repId: String(formData.get("repId")),
      notes: String(formData.get("notes") ?? ""),
      objectionTypeIds: formData.getAll("objections").map(String),
    });
  } catch (err) {
    return { ok: false, results: [String(err instanceof Error ? err.message : err)] };
  }
}
