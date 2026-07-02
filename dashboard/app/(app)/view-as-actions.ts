"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { VIEW_AS_COOKIE } from "@/lib/view-as";

export async function setViewAsAction(userId: string) {
  const user = await requireSession();
  if (user.role !== "admin") return;
  const jar = await cookies();
  if (!userId || userId === user.id) jar.delete(VIEW_AS_COOKIE);
  else jar.set(VIEW_AS_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}

export async function clearViewAsAction() {
  await requireSession();
  (await cookies()).delete(VIEW_AS_COOKIE);
  revalidatePath("/", "layout");
}
