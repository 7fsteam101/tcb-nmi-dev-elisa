import { formOptions } from "@/lib/form-options";
import { SalesCallForm } from "./form";

export const dynamic = "force-dynamic";

export default async function SalesCallPage() {
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
