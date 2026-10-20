import type { LegalDocument } from "@/lib/legal/policies";

/** Affiche une page légale : sections, paragraphes et listes (lignes commençant par « - »). */
export function LegalDocumentView({ doc, updated, className = "", headingClassName = "" }: { doc: LegalDocument; updated: string; className?: string; headingClassName?: string }) {
  return (
    <article className={className}>
      <h1 className={`text-3xl font-bold leading-tight ${headingClassName}`}>{doc.title}</h1>
      <p className="mt-2 text-sm opacity-70">{updated}</p>
      {doc.intro && <p className="mt-6 leading-relaxed">{doc.intro}</p>}
      {doc.sections.map((section) => {
        // Regroupe les lignes « - » consécutives en une liste.
        const blocks: (string | string[])[] = [];
        for (const line of section.body) {
          if (line.startsWith("- ")) {
            const last = blocks.at(-1);
            if (Array.isArray(last)) last.push(line.slice(2));
            else blocks.push([line.slice(2)]);
          } else blocks.push(line);
        }
        return (
          <section key={section.heading} className="mt-8">
            <h2 className="text-xl font-semibold">{section.heading}</h2>
            {blocks.map((b, i) =>
              Array.isArray(b) ? (
                <ul key={i} className="mt-3 list-disc space-y-1.5 pl-6 leading-relaxed">{b.map((item) => <li key={item}>{item}</li>)}</ul>
              ) : (
                <p key={i} className="mt-3 leading-relaxed">{b}</p>
              ),
            )}
          </section>
        );
      })}
    </article>
  );
}
