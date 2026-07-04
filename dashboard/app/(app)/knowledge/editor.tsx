"use client";

import { useActionState, useState } from "react";
import { createArticleAction, saveArticleAction } from "./actions";

type Article = { id: string; title: string; category: string | null; body: string; published: boolean };

export function ArticleEditor({ article }: { article?: Article }) {
  const isNew = !article;
  const [state, action, pending] = useActionState(isNew ? createArticleAction : saveArticleAction, null as any);
  return (
    <form action={action} className="space-y-3">
      {article && <input type="hidden" name="id" value={article.id} />}
      <input name="title" defaultValue={article?.title} placeholder="Article title" required />
      <input name="category" defaultValue={article?.category ?? ""} placeholder="Category (e.g. Objections, Onboarding)" />
      <textarea name="body" defaultValue={article?.body} rows={14} placeholder="# Heading&#10;Body text. Use # for headings, ## for subheadings, - for bullets, blank lines for paragraphs." style={{ fontFamily: "ui-monospace, monospace" }} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={article ? article.published : true} /> Published (visible to the whole team)</label>
      <button type="submit" disabled={pending} className="btn">{pending ? "Saving..." : isNew ? "Create article" : "Save changes"}</button>
      {state && !state.ok && <span className="ml-3 text-sm" style={{ color: "var(--bad)" }}>{state.message}</span>}
      {state && state.ok && <span className="ml-3 text-sm" style={{ color: "var(--good)" }}>{state.message}</span>}
    </form>
  );
}

export function EditToggle({ children, editor }: { children: React.ReactNode; editor: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  return (
    <div>
      <button className="btn-ghost btn mb-4 px-2 py-0.5 text-xs" onClick={() => setEditing((e) => !e)}>
        {editing ? "View" : "Edit"}
      </button>
      {editing ? editor : children}
    </div>
  );
}
