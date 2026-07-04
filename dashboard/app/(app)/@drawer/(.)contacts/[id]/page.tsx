import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/access";
import { ContactBody } from "../../../contacts/[id]/detail";
import { Drawer } from "@/components/drawer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Intercepts in-app navigation to /contacts/[id] and renders the same body in a
// half-screen drawer. Direct loads still hit the full page.
export default async function ContactDrawer({ params }: { params: Promise<{ id: string }> }) {
  await requireAccess("calls");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return (
    <Drawer>
      <ContactBody id={id} />
    </Drawer>
  );
}
