import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/access";
import { ContactBody } from "./detail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Full-page contact detail (direct load / deep link). In-app navigation from a
// contact link opens the same body in a half-screen drawer (intercepting route).
export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccess("calls");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return (
    <div className="max-w-4xl">
      <div className="mb-2">
        <Link href="/contacts" className="text-sm" style={{ color: "var(--accent)" }}>&larr; Contacts</Link>
      </div>
      <ContactBody id={id} />
    </div>
  );
}
