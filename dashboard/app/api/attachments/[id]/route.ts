import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Types safe to render inline in the browser. Anything else (including SVG,
// which can carry scripts, and HTML) is forced to download so a user-uploaded
// file can never execute on the app's origin.
const INLINE_SAFE = /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf|text\/plain)$/;

// Streams a note attachment (bytea) behind the same session auth the pages use
// (requireSession redirects to /login when there is no session). Pooler rules:
// one query, no prepared statements; postgres.js returns bytea as a Buffer.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse("Not found", { status: 404 });

  const [att] = await sql`
    select filename, mime, size_bytes, data
    from core.note_attachment where id = ${id}`;
  if (!att) return new NextResponse("Not found", { status: 404 });

  // copy into a fresh Uint8Array so the body is a plain ArrayBuffer view
  const bytes = new Uint8Array(att.data as Buffer);
  const mime = String(att.mime || "application/octet-stream");
  const disposition = INLINE_SAFE.test(mime) ? "inline" : "attachment";
  // ASCII fallback for the quoted filename + RFC 5987 encoding for the real one
  const safeName = String(att.filename).replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(String(att.filename))}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
