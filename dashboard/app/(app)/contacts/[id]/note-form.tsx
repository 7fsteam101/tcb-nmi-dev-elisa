"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { addContactNoteAction } from "./actions";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

export function NoteForm({ contactId }: { contactId: string }) {
  const [state, action, pending] = useActionState(addContactNoteAction, null as any);
  const ref = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  useEffect(() => { if (state?.ok) { ref.current?.reset(); setFileError(null); } }, [state]);

  // client-side 4MB/file gate: an oversized pick is rejected on selection with
  // a clear message and the selection is cleared. The server re-checks anyway.
  const checkFiles = () => {
    const files = Array.from(fileRef.current?.files ?? []);
    const big = files.find((f) => f.size > MAX_FILE_BYTES);
    if (big) {
      setFileError(`${big.name} is over the 4MB limit`);
      if (fileRef.current) fileRef.current.value = "";
    } else {
      setFileError(null);
    }
  };

  return (
    <form ref={ref} action={action} className="mb-3 flex flex-col gap-2">
      <input type="hidden" name="contactId" value={contactId} />
      <textarea name="body" rows={2} placeholder="Add a note about this contact..." required
        style={{ background: "var(--panel-2)" }} />
      <input ref={fileRef} type="file" name="files" multiple onChange={checkFiles}
        accept="image/*,application/pdf,.pdf,.csv,.txt,.doc,.docx,.xls,.xlsx"
        aria-label="Attach files, up to 4MB each"
        className="text-xs" style={{ background: "var(--panel-2)", color: "var(--muted)" }} />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="btn px-3 py-1 text-[13px]">{pending ? "Saving..." : "Add note"}</button>
        {fileError
          ? <span className="text-[12px]" style={{ color: "var(--bad)" }}>{fileError}</span>
          : state && <span className="text-[12px]" style={{ color: state.ok ? "var(--good)" : "var(--bad)" }}>{state.message}</span>}
      </div>
    </form>
  );
}
