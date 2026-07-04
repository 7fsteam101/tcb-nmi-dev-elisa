import { listOptions } from "./actions";
import { OptionsEditor } from "./editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function OptionsAdmin() {
  const lists = await listOptions();
  return (
    <div>
      <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
        These lists ARE the form dropdowns — rename, reorder, add, or disable an option and every form updates instantly.
        Disabled options keep their history but stop being selectable.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(lists).map(([key, l]) => (
          <OptionsEditor key={key} listKey={key} label={l.label} rows={l.rows as never} />
        ))}
      </div>
    </div>
  );
}
