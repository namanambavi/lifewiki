import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function resolveWikilinks(markdown: string, existingSlugs: string[], personSlug?: string): string {
  const prefix = personSlug ? `/${personSlug}/wiki` : "/wiki";

  // Build a lookup map for faster matching:
  // 1. Exact slug ending match (e.g., "companies/oximy" matches [[Oximy]])
  // 2. Fuzzy: slug contains the title slug (e.g., "technology/saas" matches [[SaaS]])
  // 3. Title-to-slug: the last segment of each slug (e.g., "oximy" from "companies/oximy")
  const slugByEnding = new Map<string, string>();
  const slugBySegment = new Map<string, string>();
  for (const s of existingSlugs) {
    const lastSegment = s.split("/").pop() || "";
    slugBySegment.set(lastSegment, s);
    slugByEnding.set(lastSegment, s);
  }

  return markdown.replace(/\[\[(.+?)\]\]/g, (_, title: string) => {
    const titleSlug = slugify(title);

    // Try exact ending match first
    let matchedSlug = existingSlugs.find((s) => s.endsWith(`/${titleSlug}`));

    // Try matching just the last segment
    if (!matchedSlug) {
      matchedSlug = slugBySegment.get(titleSlug);
    }

    // Try partial match: see if any slug's last segment is CONTAINED in the title slug
    // e.g., titleSlug "software-as-a-service-saas" contains "saas"
    if (!matchedSlug) {
      for (const [segment, slug] of slugBySegment) {
        if (titleSlug.includes(segment) && segment.length > 2) {
          matchedSlug = slug;
          break;
        }
      }
    }

    // Try reverse: title slug is CONTAINED in a slug's last segment
    // e.g., titleSlug "y-combinator-winter-2026-batch" contains "y-combinator-winter-2026"
    if (!matchedSlug) {
      for (const [segment, slug] of slugBySegment) {
        if (segment.includes(titleSlug.slice(0, -6)) && titleSlug.length > 5) {
          matchedSlug = slug;
          break;
        }
      }
    }

    if (matchedSlug) {
      return `<a href="${prefix}/${matchedSlug}" class="wikilink">${title}</a>`;
    }
    return `<a href="${prefix}/${titleSlug}" class="wikilink-new" title="${title} (page does not exist)">${title}</a>`;
  });
}

function convertFootnotes(markdown: string): string {
  return markdown.replace(/\[(\d+)\]/g, "<sup>[$1]</sup>");
}

export async function renderMarkdown(markdown: string, existingSlugs: string[] = [], personSlug?: string): Promise<string> {
  let processed = resolveWikilinks(markdown, existingSlugs, personSlug);
  processed = convertFootnotes(processed);
  const result = await unified()
    .use(remarkParse).use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw).use(rehypeStringify)
    .process(processed);
  return String(result);
}
