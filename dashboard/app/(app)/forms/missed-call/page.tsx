import { formOptions } from "@/lib/form-options";
import { MissedCallForm } from "./form";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function MissedCallPage() {
  await requireAccess("forms");
  const options = await formOptions();
  return <MissedCallForm options={options} />;
}
