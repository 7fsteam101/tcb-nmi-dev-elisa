import { RecordDrawer } from "@/components/record-drawer";
import { AppointmentBody } from "../../../appointments/[id]/body";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function D({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RecordDrawer>
      <AppointmentBody id={id} />
    </RecordDrawer>
  );
}
