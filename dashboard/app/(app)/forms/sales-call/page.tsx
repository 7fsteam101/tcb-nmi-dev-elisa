import { formOptions } from "@/lib/form-options";
import { SalesCallForm } from "./form";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function SalesCallPage() {
  await requireAccess("forms");
  const options = await formOptions();
  return <SalesCallForm options={options} />;
}
