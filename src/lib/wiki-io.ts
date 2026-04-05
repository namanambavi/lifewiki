import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import type { Article, ArticleFrontmatter, ArticleIndex, MainPageData } from "./types";

const WIKI_DIR = path.join(process.cwd(), "data/wiki");
const USERS_DIR = path.join(process.cwd(), "data/users");

export function getWikiDir(personSlug?: string): string {
  if (personSlug) {
    return path.join(USERS_DIR, personSlug, "wiki");
  }
  return WIKI_DIR;
}

export function getRawDir(personSlug?: string): string {
  if (personSlug) {
    return path.join(USERS_DIR, personSlug, "raw");
  }
  return path.join(process.cwd(), "data/raw");
}

export async function writeArticle(
  article: Article,
  wikiDir: string = WIKI_DIR
): Promise<void> {
  const filePath = path.join(wikiDir, `${article.slug}.md`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const fileContent = matter.stringify(article.content, article.frontmatter);
  await fs.writeFile(filePath, fileContent, "utf-8");
}

export async function readArticle(
  slug: string,
  wikiDir: string = WIKI_DIR
): Promise<Article> {
  const filePath = path.join(wikiDir, `${slug}.md`);
  const raw = await fs.readFile(filePath, "utf-8");
  const { data, content } = matter(raw);
  return {
    slug,
    frontmatter: data as ArticleFrontmatter,
    content: content.trim(),
  };
}

export async function listArticles(
  wikiDir: string = WIKI_DIR
): Promise<ArticleIndex[]> {
  const indexPath = path.join(wikiDir, "index.md");
  const raw = await fs.readFile(indexPath, "utf-8");
  const { content } = matter(raw);

  const articles: ArticleIndex[] = [];
  const lines = content.split("\n").filter((l) => l.startsWith("- ["));

  for (const line of lines) {
    const match = line.match(
      /^- \[(.+?)\]\((.+?)\) — (.+?) \| (\w+) \| (.+)$/
    );
    if (match) {
      articles.push({
        title: match[1],
        slug: match[2],
        summary: match[3],
        type: match[4] as ArticleIndex["type"],
        categories: match[5].split(", "),
      });
    }
  }
  return articles;
}

export async function articleExists(
  slug: string,
  wikiDir: string = WIKI_DIR
): Promise<boolean> {
  try {
    await fs.access(path.join(wikiDir, `${slug}.md`));
    return true;
  } catch {
    return false;
  }
}

export async function getAllSlugs(
  wikiDir: string = WIKI_DIR
): Promise<string[]> {
  const slugs: string[] = [];
  async function walk(dir: string, prefix: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      } else if (entry.name.endsWith(".md") && entry.name !== "index.md" && entry.name !== "log.md") {
        slugs.push(`${prefix}${entry.name.replace(".md", "")}`);
      }
    }
  }
  await walk(wikiDir, "");
  return slugs;
}

export async function listPeople(): Promise<{ slug: string; name: string; articleCount: number }[]> {
  const people: { slug: string; name: string; articleCount: number }[] = [];

  try {
    const entries = await fs.readdir(USERS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const slug = entry.name;
      const mainPagePath = path.join(USERS_DIR, slug, "wiki", "main-page.json");
      try {
        const raw = await fs.readFile(mainPagePath, "utf-8");
        const data: MainPageData = JSON.parse(raw);
        people.push({
          slug,
          name: data.personName,
          articleCount: data.totalArticles,
        });
      } catch {
        // Skip directories without a valid main-page.json
      }
    }
  } catch {
    // data/users/ doesn't exist yet — return empty
  }

  return people;
}
