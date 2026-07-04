"use client";

import { useActionState, useRef, useEffect } from "react";
import { addContactNoteAction } from "./actions";

export function NoteForm({ contactId }: { contactId: string }) {
  const [state, action, pending] = useActionState(addContactNoteAction, null as any);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="mb-3 flex flex-col gap-2">
      <input type="hidden" name="contactId" value={contactId} />
      <textarea name="body" rows={2} placeholder="Add a note about this contact..." required
        style={{ background: "var(--panel-2)" }} />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="btn px-3 py-1 text-[13px]">{pending ? "Saving..." : "Add note"}</button>
        {state && <span className="text-[12px]" style={{ color: state.ok ? "var(--good)" : "var(--bad)" }}>{state.message}</span>}
      </div>
    </form>
  );
}
