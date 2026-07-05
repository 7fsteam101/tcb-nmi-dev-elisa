import { RecordDrawer } from "@/components/record-drawer";
import { ReceivablesBody } from "../../../receivables/[id]/body";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Intercepts in-app navigation to /receivables/[id] and renders the same body in a
// drawer on top of the current page. Direct loads still hit the full page.
export default async function D({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RecordDrawer>
      <ReceivablesBody id={id} />
    </RecordDrawer>
  );
}
