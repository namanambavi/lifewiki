import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function resolveWikilinks(markdown: string, existingSlugs: string[]): string {
  return markdown.replace(/\[\[(.+?)\]\]/g, (_, title: string) => {
    const titleSlug = slugify(title);
    const matchedSlug = existingSlugs.find((s) => s.endsWith(`/${titleSlug}`));
    if (matchedSlug) {
      return `<a href="/wiki/${matchedSlug}" class="wikilink">${title}</a>`;
    }
    return `<a href="/wiki/${titleSlug}" class="wikilink-new" title="${title} (page does not exist)">${title}</a>`;
  });
}

function convertFootnotes(markdown: string): string {
  return markdown.replace(/\[(\d+)\]/g, "<sup>[$1]</sup>");
}

export async function renderMarkdown(markdown: string, existingSlugs: string[] = []): Promise<string> {
  let processed = resolveWikilinks(markdown, existingSlugs);
  processed = convertFootnotes(processed);
  const result = await unified()
    .use(remarkParse).use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw).use(rehypeStringify)
    .process(processed);
  return String(result);
}
