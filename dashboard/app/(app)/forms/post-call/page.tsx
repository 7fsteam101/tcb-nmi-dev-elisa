import { formOptions } from "@/lib/form-options";
import { PostCallForm } from "./form";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function PostCallPage() {
  await requireAccess("forms");
  const options = await formOptions();
  return <PostCallForm options={options} />;
}
