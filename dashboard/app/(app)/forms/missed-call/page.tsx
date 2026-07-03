import { formOptions } from "@/lib/form-options";
import { MissedCallForm } from "./form";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function MissedCallPage() {
  await requireAccess("forms");
  const options = await formOptions();
  return (
    <div>
      <h1 className="text-xl font-semibold">Missed Call Report</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        No-shows, cancellations, and reschedules. The old slot stays in history so leakage is measurable.
      </p>
      <MissedCallForm options={options} />
    </div>
  );
}
