import { formOptions } from "@/lib/form-options";
import { PostCallForm } from "./form";
import { requireAccess } from "@/lib/access";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function PostCallPage({ searchParams }: { searchParams: Promise<{ appointmentId?: string; callId?: string }> }) {
  await requireAccess("forms");
  const options = await formOptions();
  const sp = await searchParams;
  // the appointment buttons pass appointmentId; post-call needs the call id, so resolve it
  let defaultCallId = sp.callId ?? "";
  if (!defaultCallId && sp.appointmentId) {
    const [r] = await sql`select call_id from sales.appointment where id = ${sp.appointmentId} limit 1`;
    defaultCallId = (r?.call_id as string) ?? "";
  }
  return <PostCallForm options={options} defaultCallId={defaultCallId} />;
}
