import { RecordDrawer } from "@/components/record-drawer";
import { AgreementsBody } from "../../../agreements/[id]/body";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Intercepts in-app navigation to /agreements/[id] and renders the same body in a
// drawer on top of the current page. Direct loads still hit the full page.
export default async function D({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RecordDrawer>
      <AgreementsBody id={id} />
    </RecordDrawer>
  );
}
