import { formOptions } from "@/lib/form-options";
import { PostCallForm } from "./form";

export const dynamic = "force-dynamic";

export default async function PostCallPage() {
  const options = await formOptions();
  return (
    <div>
      <h1 className="text-xl font-semibold">Post-Call Notes</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        Notes and objections after a taken call. The note posts to the lead in Close.
      </p>
      <PostCallForm options={options} />
    </div>
  );
}
