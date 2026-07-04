import { Fragment } from "react";

// Tiny markdown-lite renderer (no dependency): # -> h2, ## -> h3, - -> list,
// blank line -> paragraph break, single newline -> <br>.
export function MarkdownLite({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n\n+/);
  return (
    <div className="space-y-3 text-sm leading-relaxed" style={{ color: "var(--text)" }}>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5" style={{ color: "var(--muted)" }}>
              {lines.map((l, j) => <li key={j}>{l.slice(2)}</li>)}
            </ul>
          );
        }
        if (block.startsWith("## ")) return <h3 key={i} className="text-sm font-semibold" style={{ color: "var(--text)" }}>{block.slice(3)}</h3>;
        if (block.startsWith("# ")) return <h2 key={i} className="text-base font-semibold" style={{ color: "var(--text)" }}>{block.slice(2)}</h2>;
        return (
          <p key={i} style={{ color: "var(--muted)" }}>
            {lines.map((l, j) => <Fragment key={j}>{l}{j < lines.length - 1 && <br />}</Fragment>)}
          </p>
        );
      })}
    </div>
  );
}
