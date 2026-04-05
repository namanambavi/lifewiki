interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function extractHeadings(html: string): TocItem[] {
  const headings: TocItem[] = [];
  const regex = /<h([23])[^>]*id="([^"]*)"[^>]*>(.*?)<\/h[23]>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    headings.push({ level: parseInt(match[1]), id: match[2], text: match[3].replace(/<[^>]+>/g, "") });
  }
  return headings;
}

export function addHeadingIds(html: string): string {
  return html.replace(/<h([23])([^>]*)>(.*?)<\/h([23])>/gi, (_, level, attrs, text, closeLevel) => {
    const id = text.replace(/<[^>]+>/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return `<h${level}${attrs} id="${id}">${text}</h${closeLevel}>`;
  });
}

export default function TableOfContents({ headings }: { headings: TocItem[] }) {
  if (headings.length === 0) return null;
  return (
    <div className="toc">
      <div className="toc-title">Contents</div>
      <ol>
        {headings.filter(h => h.level === 2).map((h2) => {
          const h2Idx = headings.indexOf(h2);
          const nextH2Idx = headings.findIndex((h, i) => i > h2Idx && h.level === 2);
          const subHeadings = headings.filter((h, i) => h.level === 3 && i > h2Idx && (nextH2Idx === -1 || i < nextH2Idx));
          return (
            <li key={h2.id}>
              <a href={`#${h2.id}`}>{h2.text}</a>
              {subHeadings.length > 0 && (
                <ol>{subHeadings.map((h3) => <li key={h3.id}><a href={`#${h3.id}`}>{h3.text}</a></li>)}</ol>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
