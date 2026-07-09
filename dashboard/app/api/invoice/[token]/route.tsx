import { renderToBuffer } from "@react-pdf/renderer";
import { getInvoiceData } from "@/lib/invoice";
import { InvoiceDocument } from "@/lib/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Public-by-token, like /pay/<token>: the customer downloads their own invoice
// without logging in. Streams application/pdf.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getInvoiceData(token);
  if (!data) return new Response("Invoice not found", { status: 404 });
  const buf = await renderToBuffer(<InvoiceDocument data={data} />);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${data.invoiceNumber}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
