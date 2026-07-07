import { formOptions } from "@/lib/form-options";
import { MissedCallForm } from "./form";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function MissedCallPage({ searchParams }: { searchParams: Promise<{ appointmentId?: string }> }) {
  await requireAccess("forms");
  const options = await formOptions();
  const sp = await searchParams;
  return <MissedCallForm options={options} defaultAppointmentId={sp.appointmentId ?? ""} />;
}
