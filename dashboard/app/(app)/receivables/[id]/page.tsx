import { ReceivablesBody } from "./body";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-4xl">
      <ReceivablesBody id={id} />
    </div>
  );
}
