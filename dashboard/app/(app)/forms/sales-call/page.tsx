import { formOptions } from "@/lib/form-options";
import { SalesCallForm } from "./form";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function SalesCallPage() {
  await requireAccess("forms");
  const options = await formOptions();
  return (
    <div>
      <h1 className="text-xl font-semibold">Sales Call Report</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        Logs the outcome, creates the deal on a close, and pushes the stage and a note to Close.
      </p>
      <SalesCallForm options={options} />
    </div>
  );
}
