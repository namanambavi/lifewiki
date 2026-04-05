# WikiPeople Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Wikipedia-style encyclopedia generator that takes a LinkedIn URL and produces 30-50+ interlinked wiki articles with faithful Vector skin UI.

**Architecture:** Next.js App Router serves Wikipedia-cloned pages rendered from LLM-generated markdown files. A LinkedIn API fetches profile data, an LLM (Claude via Anthropic SDK) generates interlinked markdown articles, and a remark/rehype pipeline renders them as Wikipedia-faithful HTML with wikilink resolution.

**Tech Stack:** Next.js 14+, TypeScript, Tailwind CSS, Anthropic SDK, remark/rehype, gray-matter

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `next.config.js`
- Create: `tsconfig.json`
- Create: `tailwind.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/styles/globals.css`
- Create: `.env.local.example`

- [ ] **Step 1: Initialize Next.js project**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @anthropic-ai/sdk gray-matter remark remark-html remark-gfm rehype-stringify rehype-raw unified
```

- [ ] **Step 3: Create env example**

Create `.env.local.example`:
```
ANTHROPIC_API_KEY=sk-ant-...
LINKEDIN_API_URL=https://your-linkedin-api.com/profile
LINKEDIN_API_KEY=your-key-here
```

- [ ] **Step 4: Create data directories**

```bash
mkdir -p data/raw/linkedin data/raw/web data/raw/uploads data/wiki/people data/wiki/companies data/wiki/education data/wiki/technology data/wiki/places data/wiki/career
```

- [ ] **Step 5: Add data to .gitignore**

Append to `.gitignore`:
```
data/raw/
data/wiki/
.env.local
```

- [ ] **Step 6: Verify dev server starts**

```bash
npm run dev
```

Open `http://localhost:3000` — should see default Next.js page.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with dependencies"
```

---

### Task 2: Types and Schema

**Files:**
- Create: `src/lib/types.ts`
- Create: `data/schema.json`

- [ ] **Step 1: Define core types**

Create `src/lib/types.ts`:

```typescript
export type PageType = "person" | "company" | "education" | "technology" | "place" | "career";

export interface Infobox {
  [key: string]: string | string[];
}

export interface ArticleFrontmatter {
  title: string;
  type: PageType;
  categories: string[];
  related: string[];
  infobox: Infobox;
  sources: string[];
  last_updated: string;
}

export interface Article {
  slug: string;           // e.g. "companies/google"
  frontmatter: ArticleFrontmatter;
  content: string;        // markdown body (without frontmatter)
  html?: string;          // rendered HTML
}

export interface ArticleIndex {
  slug: string;
  title: string;
  type: PageType;
  summary: string;
  categories: string[];
}

export interface LinkedInProfile {
  name: string;
  headline: string;
  summary: string;
  location: string;
  positions: {
    title: string;
    company: string;
    startDate: string;
    endDate: string | null;
    description: string;
  }[];
  education: {
    school: string;
    degree: string;
    field: string;
    startDate: string;
    endDate: string;
  }[];
  skills: string[];
  connections: {
    name: string;
    headline: string;
    company?: string;
  }[];
}

export interface EntityPlan {
  slug: string;
  title: string;
  type: PageType;
  dataContext: string;    // relevant data snippet for this article
}

export interface GenerationStatus {
  phase: "fetching" | "planning" | "generating" | "finalizing" | "complete" | "error";
  totalArticles: number;
  completedArticles: number;
  currentArticle: string;
  error?: string;
}

export interface DidYouKnow {
  fact: string;
  relatedArticles: string[]; // slugs
}

export interface MainPageData {
  personName: string;
  encyclopediaName: string;
  totalArticles: number;
  totalSources: number;
  totalCrossReferences: number;
  featuredArticleSummary: string;
  featuredArticleSlug: string;
  didYouKnow: DidYouKnow[];
  portals: { name: string; count: number; slug: string }[];
  recentPeople: { name: string; description: string; slug: string }[];
  careerTimeline: { year: string; event: string; slug: string }[];
}
```

- [ ] **Step 2: Create schema.json**

Create `data/schema.json`:

```json
{
  "page_types": {
    "person": {
      "sections": ["Early life and education", "Career", "Skills and expertise", "Notable connections"],
      "infobox_fields": ["born", "education", "occupation", "employer", "known_for", "skills"]
    },
    "company": {
      "sections": ["History", "Products and services", "Key people", "Related entities"],
      "infobox_fields": ["industry", "founded", "headquarters", "key_people"]
    },
    "education": {
      "sections": ["Overview", "Notable programs", "Notable alumni"],
      "infobox_fields": ["type", "location", "founded", "notable_programs"]
    },
    "technology": {
      "sections": ["Overview", "Usage", "Related technologies"],
      "infobox_fields": ["paradigm", "first_appeared", "used_by"]
    },
    "place": {
      "sections": ["Overview", "Economy", "Notable companies", "Notable people"],
      "infobox_fields": ["country", "state", "population", "known_for"]
    },
    "career": {
      "sections": ["Overview", "Timeline", "Key transitions"],
      "infobox_fields": ["total_years", "companies", "current_role"]
    }
  },
  "naming": "lowercase-hyphenated",
  "wikilink_format": "[[Page Title]]",
  "citation_format": "footnote-numbered"
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts data/schema.json
git commit -m "feat: add core types and page schema"
```

---

### Task 3: Wiki File I/O

**Files:**
- Create: `src/lib/wiki-io.ts`
- Create: `src/lib/__tests__/wiki-io.test.ts`

- [ ] **Step 1: Write tests for wiki file operations**

Create `src/lib/__tests__/wiki-io.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { readArticle, writeArticle, listArticles, getMainPageData } from "../wiki-io";

const TEST_WIKI_DIR = path.join(process.cwd(), "data/wiki-test");

describe("wiki-io", () => {
  beforeEach(async () => {
    await fs.mkdir(path.join(TEST_WIKI_DIR, "companies"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_WIKI_DIR, { recursive: true, force: true });
  });

  it("writes and reads an article with frontmatter", async () => {
    const article = {
      slug: "companies/google",
      frontmatter: {
        title: "Google",
        type: "company" as const,
        categories: ["Companies", "Technology"],
        related: ["Naman Ambavi"],
        infobox: { industry: "Technology", founded: "1998" },
        sources: ["linkedin/profile.json"],
        last_updated: "2026-04-05T00:00:00Z",
      },
      content: "**Google** is a technology company based in [[Mountain View]].\n",
    };

    await writeArticle(article, TEST_WIKI_DIR);
    const read = await readArticle("companies/google", TEST_WIKI_DIR);

    expect(read.frontmatter.title).toBe("Google");
    expect(read.frontmatter.type).toBe("company");
    expect(read.content).toContain("[[Mountain View]]");
  });

  it("lists all articles from index", async () => {
    const indexContent = `---
title: Index
---
- [Google](companies/google) — Technology company | company | Companies
- [Python](technology/python) — Programming language | technology | Technology
`;
    await fs.writeFile(path.join(TEST_WIKI_DIR, "index.md"), indexContent);

    const articles = await listArticles(TEST_WIKI_DIR);
    expect(articles).toHaveLength(2);
    expect(articles[0].slug).toBe("companies/google");
    expect(articles[0].title).toBe("Google");
  });
});
```

- [ ] **Step 2: Install vitest and run test to verify it fails**

```bash
npm install -D vitest
```

Add to `package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`

```bash
npm test -- src/lib/__tests__/wiki-io.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement wiki-io**

Create `src/lib/wiki-io.ts`:

```typescript
import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import type { Article, ArticleFrontmatter, ArticleIndex, MainPageData } from "./types";

const WIKI_DIR = path.join(process.cwd(), "data/wiki");

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
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/lib/__tests__/wiki-io.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/wiki-io.ts src/lib/__tests__/wiki-io.test.ts vitest.config.ts package.json
git commit -m "feat: wiki file I/O with read, write, list operations"
```

---

### Task 4: Markdown → HTML Pipeline

**Files:**
- Create: `src/lib/markdown.ts`
- Create: `src/lib/__tests__/markdown.test.ts`

- [ ] **Step 1: Write tests for markdown rendering and wikilink resolution**

Create `src/lib/__tests__/markdown.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../markdown";

describe("renderMarkdown", () => {
  it("converts basic markdown to HTML", async () => {
    const html = await renderMarkdown("**bold** text");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("resolves wikilinks to internal routes", async () => {
    const existingSlugs = ["companies/google", "people/naman-ambavi"];
    const html = await renderMarkdown(
      "He works at [[Google]] with [[Naman Ambavi]].",
      existingSlugs
    );
    expect(html).toContain('href="/wiki/companies/google"');
    expect(html).toContain('href="/wiki/people/naman-ambavi"');
    expect(html).toContain(">Google</a>");
    expect(html).toContain(">Naman Ambavi</a>");
  });

  it("renders missing wikilinks as red links", async () => {
    const html = await renderMarkdown("Visit [[Nonexistent Page]].", []);
    expect(html).toContain('class="wikilink-new"');
    expect(html).toContain(">Nonexistent Page</a>");
  });

  it("converts footnote markers to superscript", async () => {
    const html = await renderMarkdown("A fact.[1] Another.[2]");
    expect(html).toContain("<sup>[1]</sup>");
    expect(html).toContain("<sup>[2]</sup>");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/__tests__/markdown.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement markdown renderer**

Create `src/lib/markdown.ts`:

```typescript
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function resolveWikilinks(
  markdown: string,
  existingSlugs: string[]
): string {
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

export async function renderMarkdown(
  markdown: string,
  existingSlugs: string[] = []
): Promise<string> {
  let processed = resolveWikilinks(markdown, existingSlugs);
  processed = convertFootnotes(processed);

  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify)
    .process(processed);

  return String(result);
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/lib/__tests__/markdown.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown.ts src/lib/__tests__/markdown.test.ts
git commit -m "feat: markdown to HTML pipeline with wikilink resolution"
```

---

### Task 5: Wikipedia CSS (Vector Skin Clone)

**Files:**
- Create: `src/styles/wikipedia.css`

- [ ] **Step 1: Write the Vector skin CSS clone**

Create `src/styles/wikipedia.css`. This is a large file — the key elements of the Vector skin. (Full CSS is too long to inline here; the implementation agent should reference the approved mockup at `.superpowers/brainstorm/36150-1775407369/content/homepage-v2.html` for the exact styles and replicate them as a standalone CSS file.)

The CSS must include these selectors and rules:

```css
/* Body typography */
body { font-family: 'Linux Libertine', Georgia, 'Times New Roman', serif; background: #f8f9fa; color: #202122; }

/* Site header */
.wiki-header { background: #fff; border-bottom: 1px solid #a7d7f9; }
.wiki-logo { font-size: 20px; }

/* Tab bar */
.wiki-tabs a.active { border-bottom: 2px solid #36c; }

/* Article layout */
.wiki-title { font-size: 28px; font-weight: normal; border-bottom: 1px solid #a2a9b1; }
.wiki-content h2 { font-size: 20px; border-bottom: 1px solid #a2a9b1; }
.wiki-content a { color: #36c; }
.wiki-content a.wikilink-new { color: #ba0000; }

/* Infobox */
.infobox { background: #f8f9fa; border: 1px solid #a2a9b1; float: right; width: 260px; }
.infobox-header { background: #b8d4e3; }

/* TOC */
.toc { background: #f8f9fa; border: 1px solid #a2a9b1; }

/* Main Page sections */
.section-box { border: 1px solid #a2a9b1; background: #fff; }
.section-header.feat { background: #cee0f2; }
.section-header.dyk { background: #cee0c2; }
.section-header.news { background: #d5e5f5; }
.section-header.otd { background: #f2e2c2; }

/* Categories */
.categories { background: #f8f9fa; border: 1px solid #a2a9b1; }

/* Responsive */
@media (max-width: 768px) { .infobox { float: none; width: 100%; } }
```

The implementation agent should extract the full CSS from the mockup HTML files in `.superpowers/brainstorm/` and consolidate into `wikipedia.css`. The mockup files are the source of truth for visual fidelity.

- [ ] **Step 2: Import in globals.css**

Update `src/styles/globals.css` to import wikipedia.css:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
@import "./wikipedia.css";
```

- [ ] **Step 3: Commit**

```bash
git add src/styles/wikipedia.css src/styles/globals.css
git commit -m "feat: Wikipedia Vector skin CSS clone"
```

---

### Task 6: Layout and Header Components

**Files:**
- Create: `src/components/WikiHeader.tsx`
- Create: `src/components/WikiTabs.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Build WikiHeader**

Create `src/components/WikiHeader.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function WikiHeader({ encyclopediaName }: { encyclopediaName: string }) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <div className="wiki-header">
      <a href="/" className="wiki-logo">
        <b>{encyclopediaName}</b>
      </a>
      <form onSubmit={handleSearch} className="wiki-search">
        <input
          type="text"
          placeholder={`Search ${encyclopediaName}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit">Search</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Build WikiTabs**

Create `src/components/WikiTabs.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const tabs = [
  { href: "/", label: "Main Page" },
  { href: "/articles", label: "All articles" },
  { href: "/sources", label: "Sources" },
];

export default function WikiTabs() {
  const pathname = usePathname();

  return (
    <div className="wiki-tabs">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={pathname === tab.href ? "active" : ""}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Update layout.tsx**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import WikiHeader from "@/components/WikiHeader";
import WikiTabs from "@/components/WikiTabs";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "WikiPeople",
  description: "Your own Wikipedia, generated from LinkedIn",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WikiHeader encyclopediaName="WikiPeople" />
        <WikiTabs />
        <main>{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify header and tabs render**

```bash
npm run dev
```

Open `http://localhost:3000` — should see the Wikipedia-style header with logo and search, plus the tab bar.

- [ ] **Step 5: Commit**

```bash
git add src/components/WikiHeader.tsx src/components/WikiTabs.tsx src/app/layout.tsx
git commit -m "feat: Wikipedia header and tab bar components"
```

---

### Task 7: Infobox and Table of Contents Components

**Files:**
- Create: `src/components/Infobox.tsx`
- Create: `src/components/TableOfContents.tsx`

- [ ] **Step 1: Build Infobox component**

Create `src/components/Infobox.tsx`:

```tsx
import type { Infobox as InfoboxType } from "@/lib/types";

interface Props {
  title: string;
  infobox: InfoboxType;
}

export default function Infobox({ title, infobox }: Props) {
  return (
    <div className="infobox">
      <div className="infobox-header">{title}</div>
      <div className="infobox-image">[ Photo ]</div>
      <table>
        <tbody>
          {Object.entries(infobox).map(([key, value]) => (
            <tr key={key}>
              <th>{key.replace(/_/g, " ")}</th>
              <td>{Array.isArray(value) ? value.join(", ") : value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Build TableOfContents component**

Create `src/components/TableOfContents.tsx`:

```tsx
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
    headings.push({
      level: parseInt(match[1]),
      id: match[2],
      text: match[3].replace(/<[^>]+>/g, ""),
    });
  }
  return headings;
}

export function addHeadingIds(html: string): string {
  let counter = 0;
  return html.replace(/<h([23])([^>]*)>(.*?)<\/h([23])>/gi, (_, level, attrs, text, closeLevel) => {
    const id = text.replace(/<[^>]+>/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    counter++;
    return `<h${level}${attrs} id="${id}">${text}</h${closeLevel}>`;
  });
}

export default function TableOfContents({ headings }: { headings: TocItem[] }) {
  if (headings.length === 0) return null;

  return (
    <div className="toc">
      <div className="toc-title">Contents</div>
      <ol>
        {headings.filter(h => h.level === 2).map((h2, i) => {
          const subHeadings = headings.filter(
            (h3, j) => h3.level === 3 && j > headings.indexOf(h2) &&
              (headings.findIndex((next, k) => k > headings.indexOf(h2) && next.level === 2) === -1 ||
               j < headings.findIndex((next, k) => k > headings.indexOf(h2) && next.level === 2))
          );
          return (
            <li key={h2.id}>
              <a href={`#${h2.id}`}>{h2.text}</a>
              {subHeadings.length > 0 && (
                <ol>
                  {subHeadings.map((h3) => (
                    <li key={h3.id}><a href={`#${h3.id}`}>{h3.text}</a></li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Infobox.tsx src/components/TableOfContents.tsx
git commit -m "feat: Infobox and TableOfContents components"
```

---

### Task 8: Article Page

**Files:**
- Create: `src/components/ArticlePage.tsx`
- Create: `src/app/wiki/[...slug]/page.tsx`

- [ ] **Step 1: Build ArticlePage component**

Create `src/components/ArticlePage.tsx`:

```tsx
import Infobox from "./Infobox";
import TableOfContents, { extractHeadings, addHeadingIds } from "./TableOfContents";
import type { Article } from "@/lib/types";

interface Props {
  article: Article;
}

export default function ArticlePage({ article }: Props) {
  const htmlWithIds = addHeadingIds(article.html || "");
  const headings = extractHeadings(htmlWithIds);

  return (
    <div className="wiki-body">
      <div className="wiki-content">
        <h1 className="wiki-title">{article.frontmatter.title}</h1>

        {article.frontmatter.infobox && Object.keys(article.frontmatter.infobox).length > 0 && (
          <Infobox title={article.frontmatter.title} infobox={article.frontmatter.infobox} />
        )}

        <TableOfContents headings={headings} />

        <div dangerouslySetInnerHTML={{ __html: htmlWithIds }} />

        {article.frontmatter.categories.length > 0 && (
          <div className="categories">
            <span>Categories: </span>
            {article.frontmatter.categories.map((cat, i) => (
              <span key={cat}>
                <a href={`/search?q=${encodeURIComponent(cat)}`}>{cat}</a>
                {i < article.frontmatter.categories.length - 1 && " · "}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build article route**

Create `src/app/wiki/[...slug]/page.tsx`:

```tsx
import { readArticle, getAllSlugs } from "@/lib/wiki-io";
import { renderMarkdown } from "@/lib/markdown";
import ArticlePage from "@/components/ArticlePage";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ slug: string[] }>;
}

export default async function WikiArticle({ params }: Props) {
  const { slug } = await params;
  const slugPath = slug.join("/");

  try {
    const article = await readArticle(slugPath);
    const allSlugs = await getAllSlugs();
    article.html = await renderMarkdown(article.content, allSlugs);
    return <ArticlePage article={article} />;
  } catch {
    notFound();
  }
}
```

- [ ] **Step 3: Create a test article to verify rendering**

Create `data/wiki/companies/test-company.md` (temporary, for visual testing):

```markdown
---
title: "Test Company"
type: company
categories: ["Companies", "Technology"]
related: ["Naman Ambavi"]
infobox:
  industry: "Technology"
  founded: "2020"
  headquarters: "San Francisco, CA"
sources: ["linkedin/profile.json"]
last_updated: "2026-04-05T00:00:00Z"
---

**Test Company** is a technology company based in [[San Francisco]].

## History

Founded in 2020, Test Company has grown to over 100 employees.[1]

## Key people

- [[Naman Ambavi]] — Senior Engineer
- [[Jane Smith]] — CTO

## Products and services

Test Company builds [[machine learning]] infrastructure for enterprises.
```

- [ ] **Step 4: Verify article renders**

```bash
npm run dev
```

Open `http://localhost:3000/wiki/companies/test-company` — should see a Wikipedia-style article with infobox, TOC, blue wikilinks, and red links for missing pages.

- [ ] **Step 5: Delete test article, commit**

```bash
rm data/wiki/companies/test-company.md
git add src/components/ArticlePage.tsx src/app/wiki/
git commit -m "feat: article page with infobox, TOC, wikilinks"
```

---

### Task 9: Main Page

**Files:**
- Create: `src/components/MainPage.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Build MainPage component**

Create `src/components/MainPage.tsx`:

```tsx
import type { MainPageData } from "@/lib/types";

export default function MainPage({ data }: { data: MainPageData }) {
  return (
    <div className="main-page">
      <div className="welcome-block">
        <h2>Welcome to <b>{data.encyclopediaName}</b>,</h2>
        <p className="welcome-sub">
          the free encyclopedia about <a href={`/wiki/${data.featuredArticleSlug}`}>{data.personName}</a>&apos;s professional universe
        </p>
      </div>

      <div className="stats-bar">
        <b>{data.totalArticles}</b> articles &middot; <b>{data.totalSources}</b> sources &middot; <b>{data.totalCrossReferences}</b> cross-references
      </div>

      <div className="portal-bar">
        <b>Portals:</b>{" "}
        {data.portals.map((p, i) => (
          <span key={p.name}>
            <a href={`/wiki/${p.slug}`}>{p.name} ({p.count})</a>
            {i < data.portals.length - 1 && " · "}
          </span>
        ))}
      </div>

      <div className="grid-2col">
        <div>
          <div className="section-box">
            <div className="section-header feat">From today&apos;s featured article</div>
            <div className="section-body">
              <p>
                <span dangerouslySetInnerHTML={{ __html: data.featuredArticleSummary }} />
                {" "}<b><a href={`/wiki/${data.featuredArticleSlug}`}>Full article...</a></b>
              </p>
            </div>
          </div>
        </div>
        <div>
          <div className="section-box">
            <div className="section-header dyk">Did you know ...</div>
            <div className="section-body">
              <ul>
                {data.didYouKnow.map((item, i) => (
                  <li key={i} dangerouslySetInnerHTML={{ __html: item.fact }} />
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2col">
        <div>
          <div className="section-box">
            <div className="section-header news">In the network</div>
            <div className="section-body">
              <ul>
                {data.recentPeople.map((person) => (
                  <li key={person.slug}>
                    <b><a href={`/wiki/${person.slug}`}>{person.name}</a></b> — {person.description}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div>
          <div className="section-box">
            <div className="section-header otd">Career timeline</div>
            <div className="section-body">
              <ul>
                {data.careerTimeline.map((item, i) => (
                  <li key={i}>
                    <b>{item.year}</b> &mdash; <a href={`/wiki/${item.slug}`}>{item.event}</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire up the main page route**

Replace `src/app/page.tsx`:

```tsx
import MainPage from "@/components/MainPage";
import type { MainPageData } from "@/lib/types";
import fs from "fs/promises";
import path from "path";

async function getMainPageData(): Promise<MainPageData | null> {
  const mainPagePath = path.join(process.cwd(), "data/wiki/main-page.json");
  try {
    const raw = await fs.readFile(mainPagePath, "utf-8");
    return JSON.parse(raw) as MainPageData;
  } catch {
    return null;
  }
}

export default async function Home() {
  const data = await getMainPageData();

  if (!data) {
    return (
      <div className="main-page" style={{ textAlign: "center", padding: "80px 20px" }}>
        <h1 style={{ fontSize: "28px", marginBottom: "12px" }}>WikiPeople</h1>
        <p style={{ marginBottom: "20px", color: "#54595d" }}>Paste a LinkedIn URL. Get your own Wikipedia.</p>
        <form action="/api/generate" method="POST" style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
          <input
            name="url"
            type="text"
            placeholder="linkedin.com/in/yourname"
            style={{ padding: "8px 12px", border: "2px solid #36c", borderRadius: "4px", width: "400px", fontSize: "14px" }}
          />
          <button
            type="submit"
            style={{ background: "#36c", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "4px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
          >
            Generate Wiki
          </button>
        </form>
      </div>
    );
  }

  return <MainPage data={data} />;
}
```

- [ ] **Step 3: Verify empty state renders**

```bash
npm run dev
```

Open `http://localhost:3000` — should see the "Paste a LinkedIn URL" landing page (no data/wiki/main-page.json yet).

- [ ] **Step 4: Commit**

```bash
git add src/components/MainPage.tsx src/app/page.tsx
git commit -m "feat: Main Page with Wikipedia homepage layout and empty state"
```

---

### Task 10: LinkedIn API Client

**Files:**
- Create: `src/lib/linkedin.ts`
- Create: `src/lib/__tests__/linkedin.test.ts`

- [ ] **Step 1: Write test for LinkedIn client**

Create `src/lib/__tests__/linkedin.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchLinkedInProfile } from "../linkedin";

describe("fetchLinkedInProfile", () => {
  beforeEach(() => {
    vi.stubEnv("LINKEDIN_API_URL", "https://test-api.com/profile");
    vi.stubEnv("LINKEDIN_API_KEY", "test-key");
  });

  it("throws if env vars are missing", async () => {
    vi.stubEnv("LINKEDIN_API_URL", "");
    await expect(fetchLinkedInProfile("https://linkedin.com/in/test"))
      .rejects.toThrow("LINKEDIN_API_URL");
  });

  it("extracts LinkedIn username from URL", () => {
    // This tests the URL parsing, not the API call
    const { extractUsername } = require("../linkedin");
    expect(extractUsername("https://linkedin.com/in/naman")).toBe("naman");
    expect(extractUsername("https://www.linkedin.com/in/naman/")).toBe("naman");
    expect(extractUsername("linkedin.com/in/naman")).toBe("naman");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/__tests__/linkedin.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement LinkedIn client**

Create `src/lib/linkedin.ts`:

```typescript
import type { LinkedInProfile } from "./types";

export function extractUsername(url: string): string {
  const match = url.match(/linkedin\.com\/in\/([^/?]+)/);
  if (!match) throw new Error(`Invalid LinkedIn URL: ${url}`);
  return match[1].replace(/\/$/, "");
}

export async function fetchLinkedInProfile(linkedinUrl: string): Promise<LinkedInProfile> {
  const apiUrl = process.env.LINKEDIN_API_URL;
  const apiKey = process.env.LINKEDIN_API_KEY;

  if (!apiUrl) throw new Error("LINKEDIN_API_URL environment variable is required");
  if (!apiKey) throw new Error("LINKEDIN_API_KEY environment variable is required");

  const username = extractUsername(linkedinUrl);

  const response = await fetch(`${apiUrl}?url=${encodeURIComponent(linkedinUrl)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`LinkedIn API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return normalizeProfile(data);
}

function normalizeProfile(raw: Record<string, unknown>): LinkedInProfile {
  // Normalize the API response to our LinkedInProfile type.
  // This function adapts to the actual API response shape.
  // The implementation agent should adjust field mappings based on the real API response.
  return {
    name: (raw.name as string) || (raw.full_name as string) || "Unknown",
    headline: (raw.headline as string) || "",
    summary: (raw.summary as string) || (raw.about as string) || "",
    location: (raw.location as string) || "",
    positions: Array.isArray(raw.positions) ? raw.positions.map((p: Record<string, unknown>) => ({
      title: (p.title as string) || "",
      company: (p.company as string) || (p.company_name as string) || "",
      startDate: (p.startDate as string) || (p.start_date as string) || "",
      endDate: (p.endDate as string | null) || (p.end_date as string | null) || null,
      description: (p.description as string) || "",
    })) : [],
    education: Array.isArray(raw.education) ? raw.education.map((e: Record<string, unknown>) => ({
      school: (e.school as string) || (e.school_name as string) || "",
      degree: (e.degree as string) || (e.degree_name as string) || "",
      field: (e.field as string) || (e.field_of_study as string) || "",
      startDate: (e.startDate as string) || (e.start_date as string) || "",
      endDate: (e.endDate as string) || (e.end_date as string) || "",
    })) : [],
    skills: Array.isArray(raw.skills) ? raw.skills.map((s: unknown) =>
      typeof s === "string" ? s : (s as Record<string, unknown>).name as string
    ) : [],
    connections: Array.isArray(raw.connections) ? raw.connections.map((c: Record<string, unknown>) => ({
      name: (c.name as string) || "",
      headline: (c.headline as string) || "",
      company: (c.company as string) || undefined,
    })) : [],
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/lib/__tests__/linkedin.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/linkedin.ts src/lib/__tests__/linkedin.test.ts
git commit -m "feat: LinkedIn API client with URL parsing and normalization"
```

---

### Task 11: LLM Wrapper

**Files:**
- Create: `src/lib/llm.ts`

- [ ] **Step 1: Create Anthropic SDK wrapper**

Create `src/lib/llm.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is required. Get one at console.anthropic.com");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function generateText(prompt: string, systemPrompt?: string): Promise<string> {
  const anthropic = getClient();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 4096,
    system: systemPrompt || "You are a Wikipedia article writer. Write in a neutral, encyclopedic tone.",
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text : "";
}

export async function generateJSON<T>(prompt: string, systemPrompt?: string): Promise<T> {
  const text = await generateText(
    prompt + "\n\nRespond with valid JSON only. No markdown code fences.",
    systemPrompt
  );
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned) as T;
}

export async function generateBatch(
  prompts: { id: string; prompt: string; systemPrompt?: string }[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const BATCH_SIZE = 5;

  for (let i = 0; i < prompts.length; i += BATCH_SIZE) {
    const batch = prompts.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async ({ id, prompt, systemPrompt }) => {
        const text = await generateText(prompt, systemPrompt);
        return { id, text };
      })
    );
    for (const { id, text } of batchResults) {
      results.set(id, text);
    }
  }

  return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/llm.ts
git commit -m "feat: Anthropic SDK wrapper with batch generation"
```

---

### Task 12: Wiki Engine — Entity Extraction and Article Generation

**Files:**
- Create: `src/lib/wiki-engine.ts`

- [ ] **Step 1: Implement the wiki engine**

Create `src/lib/wiki-engine.ts`:

```typescript
import type { LinkedInProfile, EntityPlan, MainPageData, GenerationStatus } from "./types";
import { generateText, generateJSON, generateBatch } from "./llm";
import { writeArticle } from "./wiki-io";
import fs from "fs/promises";
import path from "path";
import schema from "../../data/schema.json";

const WIKI_DIR = path.join(process.cwd(), "data/wiki");

let status: GenerationStatus = {
  phase: "complete",
  totalArticles: 0,
  completedArticles: 0,
  currentArticle: "",
};

export function getStatus(): GenerationStatus {
  return { ...status };
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function generateEncyclopedia(profile: LinkedInProfile): Promise<void> {
  status = { phase: "planning", totalArticles: 0, completedArticles: 0, currentArticle: "Planning articles..." };

  // Step 1: Plan entities
  const plan = await planEntities(profile);
  status.totalArticles = plan.length;
  status.phase = "generating";

  // Step 2: Generate articles in parallel batches
  const systemPrompt = `You are a Wikipedia article writer. Write in neutral, encyclopedic tone. Use [[Double Bracket]] wikilink syntax for cross-references to other articles. Use footnote markers like [1] for citations. Include proper section headers with ## for h2 and ### for h3. The article should feel like a real Wikipedia article.`;

  const prompts = plan.map((entity) => ({
    id: entity.slug,
    prompt: buildArticlePrompt(entity, profile),
    systemPrompt,
  }));

  const BATCH_SIZE = 5;
  for (let i = 0; i < prompts.length; i += BATCH_SIZE) {
    const batch = prompts.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async ({ id, prompt, systemPrompt: sp }) => {
        status.currentArticle = id;
        const text = await generateText(prompt, sp);
        return { id, text };
      })
    );

    for (const { id, text } of results) {
      const entity = plan.find((e) => e.slug === id)!;
      const { frontmatter, content } = parseGeneratedArticle(text, entity);
      await writeArticle({ slug: id, frontmatter, content });
      status.completedArticles++;
    }
  }

  // Step 3: Generate Main Page data
  status.phase = "finalizing";
  status.currentArticle = "Generating main page...";
  await generateMainPageData(profile, plan);

  // Step 4: Generate index.md
  await generateIndex(plan);

  status.phase = "complete";
}

async function planEntities(profile: LinkedInProfile): Promise<EntityPlan[]> {
  const plan: EntityPlan[] = [];
  const personSlug = `people/${slugify(profile.name)}`;

  // Main person article
  plan.push({
    slug: personSlug,
    title: profile.name,
    type: "person",
    dataContext: JSON.stringify({ name: profile.name, headline: profile.headline, summary: profile.summary, location: profile.location }),
  });

  // Company articles
  const companies = new Set<string>();
  for (const pos of profile.positions) {
    if (pos.company && !companies.has(pos.company)) {
      companies.add(pos.company);
      plan.push({
        slug: `companies/${slugify(pos.company)}`,
        title: pos.company,
        type: "company",
        dataContext: JSON.stringify({ company: pos.company, role: pos.title, dates: `${pos.startDate} - ${pos.endDate || "present"}`, description: pos.description }),
      });
    }
  }

  // Education articles
  const schools = new Set<string>();
  for (const edu of profile.education) {
    if (edu.school && !schools.has(edu.school)) {
      schools.add(edu.school);
      plan.push({
        slug: `education/${slugify(edu.school)}`,
        title: edu.school,
        type: "education",
        dataContext: JSON.stringify({ school: edu.school, degree: edu.degree, field: edu.field, dates: `${edu.startDate} - ${edu.endDate}` }),
      });
    }
  }

  // Top 10 skill articles
  const topSkills = profile.skills.slice(0, 10);
  for (const skill of topSkills) {
    plan.push({
      slug: `technology/${slugify(skill)}`,
      title: skill,
      type: "technology",
      dataContext: JSON.stringify({ skill, usedBy: profile.name }),
    });
  }

  // Location article
  if (profile.location) {
    plan.push({
      slug: `places/${slugify(profile.location)}`,
      title: profile.location,
      type: "place",
      dataContext: JSON.stringify({ location: profile.location }),
    });
  }

  // Career timeline
  plan.push({
    slug: "career/timeline",
    title: `${profile.name}'s Career Timeline`,
    type: "career",
    dataContext: JSON.stringify({ positions: profile.positions, education: profile.education }),
  });

  return plan;
}

function buildArticlePrompt(entity: EntityPlan, profile: LinkedInProfile): string {
  const pageType = schema.page_types[entity.type as keyof typeof schema.page_types];
  const sections = pageType?.sections || [];

  return `Write a Wikipedia article about "${entity.title}" (type: ${entity.type}).

Context from LinkedIn data: ${entity.dataContext}

Full profile name for cross-referencing: ${profile.name}

Required sections: ${sections.join(", ")}

Requirements:
- Start with a bold opening sentence: **${entity.title}** is...
- Use [[Double Bracket]] wikilinks to reference other entities: ${profile.positions.map(p => p.company).join(", ")}, ${profile.education.map(e => e.school).join(", ")}, ${profile.name}
- Include footnote citations like [1] referencing the LinkedIn profile as source
- Write 150-400 words
- Include YAML frontmatter at the top with: title, type (${entity.type}), categories (array), related (array of linked article titles), infobox (object with fields: ${pageType?.infobox_fields?.join(", ") || ""}), sources (["linkedin/profile.json"]), last_updated

Return the complete markdown file including the YAML frontmatter between --- delimiters.`;
}

function parseGeneratedArticle(text: string, entity: EntityPlan) {
  // Try to extract frontmatter from the generated text
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (fmMatch) {
    try {
      const matter = require("gray-matter");
      const parsed = matter(text);
      return {
        frontmatter: {
          title: parsed.data.title || entity.title,
          type: parsed.data.type || entity.type,
          categories: parsed.data.categories || [],
          related: parsed.data.related || [],
          infobox: parsed.data.infobox || {},
          sources: parsed.data.sources || ["linkedin/profile.json"],
          last_updated: new Date().toISOString(),
        },
        content: parsed.content.trim(),
      };
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: treat entire text as content, generate minimal frontmatter
  return {
    frontmatter: {
      title: entity.title,
      type: entity.type as any,
      categories: [entity.type.charAt(0).toUpperCase() + entity.type.slice(1)],
      related: [],
      infobox: {},
      sources: ["linkedin/profile.json"],
      last_updated: new Date().toISOString(),
    },
    content: text.trim(),
  };
}

async function generateMainPageData(profile: LinkedInProfile, plan: EntityPlan[]): Promise<void> {
  const personName = profile.name;
  const encyclopediaName = `${personName.split(" ")[0]}opedia`;

  const didYouKnowPrompt = `Based on this LinkedIn profile, generate 5 interesting "Did you know..." facts in the style of Wikipedia's main page. Each fact should reference specific articles using [[wikilinks]].

Profile: ${JSON.stringify({ name: profile.name, positions: profile.positions, education: profile.education, skills: profile.skills.slice(0, 10), location: profile.location })}

Return as JSON array: [{ "fact": "... that [[Person]] did X at [[Company]]?", "relatedArticles": ["people/slug", "companies/slug"] }]`;

  const didYouKnow = await generateJSON<{ fact: string; relatedArticles: string[] }[]>(didYouKnowPrompt);

  const portals = [
    { name: "People", count: plan.filter(e => e.type === "person").length, slug: "people" },
    { name: "Companies", count: plan.filter(e => e.type === "company").length, slug: "companies" },
    { name: "Education", count: plan.filter(e => e.type === "education").length, slug: "education" },
    { name: "Technology", count: plan.filter(e => e.type === "technology").length, slug: "technology" },
    { name: "Places", count: plan.filter(e => e.type === "place").length, slug: "places" },
    { name: "Career", count: plan.filter(e => e.type === "career").length, slug: "career" },
  ];

  const mainPageData: MainPageData = {
    personName,
    encyclopediaName,
    totalArticles: plan.length,
    totalSources: 1,
    totalCrossReferences: plan.length * 5, // estimate
    featuredArticleSummary: `<b><a href="/wiki/people/${slugify(personName)}">${personName}</a></b> ${profile.headline}. ${profile.summary?.slice(0, 300) || ""}`,
    featuredArticleSlug: `people/${slugify(personName)}`,
    didYouKnow: Array.isArray(didYouKnow) ? didYouKnow : [],
    portals,
    recentPeople: profile.connections.slice(0, 4).map(c => ({
      name: c.name,
      description: c.headline || c.company || "",
      slug: `people/${slugify(c.name)}`,
    })),
    careerTimeline: profile.positions.map(p => ({
      year: p.startDate?.slice(0, 4) || "N/A",
      event: `${p.title} at ${p.company}`,
      slug: `companies/${slugify(p.company)}`,
    })).reverse(),
  };

  await fs.writeFile(
    path.join(WIKI_DIR, "main-page.json"),
    JSON.stringify(mainPageData, null, 2),
    "utf-8"
  );
}

async function generateIndex(plan: EntityPlan[]): Promise<void> {
  const lines = plan.map(
    (e) => `- [${e.title}](${e.slug}) — ${e.type.charAt(0).toUpperCase() + e.type.slice(1)} article | ${e.type} | ${e.type.charAt(0).toUpperCase() + e.type.slice(1)}`
  );

  const indexContent = `---
title: Index
---
${lines.join("\n")}
`;

  await fs.writeFile(path.join(WIKI_DIR, "index.md"), indexContent, "utf-8");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/wiki-engine.ts
git commit -m "feat: wiki engine with entity planning and article generation"
```

---

### Task 13: Generate API Route

**Files:**
- Create: `src/app/api/generate/route.ts`
- Create: `src/app/api/status/route.ts`

- [ ] **Step 1: Create generate route**

Create `src/app/api/generate/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { fetchLinkedInProfile } from "@/lib/linkedin";
import { generateEncyclopedia } from "@/lib/wiki-engine";
import fs from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "LinkedIn URL is required" }, { status: 400 });
    }

    // Fetch LinkedIn profile
    const profile = await fetchLinkedInProfile(url);

    // Save raw data
    const rawDir = path.join(process.cwd(), "data/raw/linkedin");
    await fs.mkdir(rawDir, { recursive: true });
    await fs.writeFile(
      path.join(rawDir, "profile.json"),
      JSON.stringify(profile, null, 2),
      "utf-8"
    );

    // Generate encyclopedia (runs in background-ish — status is polled)
    generateEncyclopedia(profile).catch((err) => {
      console.error("Generation failed:", err);
    });

    return NextResponse.json({ status: "started", name: profile.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create status route**

Create `src/app/api/status/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getStatus } from "@/lib/wiki-engine";

export async function GET() {
  return NextResponse.json(getStatus());
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/generate/route.ts src/app/api/status/route.ts
git commit -m "feat: generate and status API routes"
```

---

### Task 14: Articles List API and Search

**Files:**
- Create: `src/app/api/articles/route.ts`
- Create: `src/app/search/page.tsx`

- [ ] **Step 1: Create articles API route**

Create `src/app/api/articles/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { listArticles } from "@/lib/wiki-io";

export async function GET(request: NextRequest) {
  try {
    const articles = await listArticles();
    const query = request.nextUrl.searchParams.get("q")?.toLowerCase();

    if (query) {
      const filtered = articles.filter(
        (a) =>
          a.title.toLowerCase().includes(query) ||
          a.summary.toLowerCase().includes(query) ||
          a.categories.some((c) => c.toLowerCase().includes(query))
      );
      return NextResponse.json(filtered);
    }

    return NextResponse.json(articles);
  } catch {
    return NextResponse.json([]);
  }
}
```

- [ ] **Step 2: Create search page**

Create `src/app/search/page.tsx`:

```tsx
import Link from "next/link";
import type { ArticleIndex } from "@/lib/types";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  let results: ArticleIndex[] = [];

  if (q) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/api/articles?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    if (res.ok) results = await res.json();
  }

  return (
    <div className="main-page">
      <h1 className="wiki-title">Search results</h1>
      {!q && <p>Enter a search term above.</p>}
      {q && results.length === 0 && <p>No results found for &quot;{q}&quot;.</p>}
      {results.map((article) => (
        <div key={article.slug} style={{ marginBottom: "16px" }}>
          <h3><Link href={`/wiki/${article.slug}`} style={{ color: "#36c" }}>{article.title}</Link></h3>
          <p style={{ fontSize: "13px", color: "#54595d" }}>{article.summary}</p>
          <p style={{ fontSize: "11px", color: "#72777d" }}>{article.categories.join(" · ")}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/articles/route.ts src/app/search/page.tsx
git commit -m "feat: article search API and search page"
```

---

### Task 15: Ask API Route

**Files:**
- Create: `src/app/api/ask/route.ts`
- Create: `src/components/AskBox.tsx`

- [ ] **Step 1: Create ask route**

Create `src/app/api/ask/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { listArticles, readArticle } from "@/lib/wiki-io";
import { generateText } from "@/lib/llm";

export async function POST(request: NextRequest) {
  try {
    const { question } = await request.json();
    if (!question) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    // Read index to find relevant articles
    const articles = await listArticles();
    const relevantSlugs = articles
      .filter((a) =>
        question.toLowerCase().includes(a.title.toLowerCase()) ||
        a.categories.some((c) => question.toLowerCase().includes(c.toLowerCase()))
      )
      .slice(0, 5)
      .map((a) => a.slug);

    // If no keyword match, take the first 3 articles as context
    if (relevantSlugs.length === 0) {
      relevantSlugs.push(...articles.slice(0, 3).map((a) => a.slug));
    }

    // Read the relevant articles
    const contexts: string[] = [];
    for (const slug of relevantSlugs) {
      try {
        const article = await readArticle(slug);
        contexts.push(`## ${article.frontmatter.title}\n${article.content}`);
      } catch {
        // Article might not exist yet
      }
    }

    const prompt = `Based on the following encyclopedia articles, answer this question: "${question}"

${contexts.join("\n\n---\n\n")}

Requirements:
- Answer concisely using information from the articles
- Use [[wikilinks]] when referencing articles
- Cite articles by name
- If the information isn't in the articles, say so`;

    const answer = await generateText(prompt);
    return NextResponse.json({ answer, sourceSlugs: relevantSlugs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create AskBox component**

Create `src/components/AskBox.tsx`:

```tsx
"use client";

import { useState } from "react";

export default function AskBox() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setAnswer("");

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      const data = await res.json();
      setAnswer(data.answer || data.error || "No answer");
    } catch {
      setAnswer("Error connecting to server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="section-box">
      <div className="section-header" style={{ background: "#e1d5e7", borderBottom: "1px solid #a2a9b1" }}>
        Ask this encyclopedia
      </div>
      <div className="section-body" style={{ fontFamily: "sans-serif" }}>
        <form onSubmit={handleAsk} style={{ display: "flex", gap: "4px" }}>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. What connects them to TensorFlow?"
            style={{ flex: 1, padding: "4px 8px", border: "1px solid #a2a9b1", fontSize: "12px" }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{ background: "#f8f9fa", border: "1px solid #a2a9b1", padding: "4px 10px", fontSize: "12px", cursor: "pointer" }}
          >
            {loading ? "..." : "Ask"}
          </button>
        </form>
        {answer && (
          <div style={{ marginTop: "8px", fontSize: "13px", lineHeight: 1.6 }}>
            {answer}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add AskBox to MainPage**

In `src/components/MainPage.tsx`, import and add `<AskBox />` inside the second `grid-2col` div, after the career timeline section box.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ask/route.ts src/components/AskBox.tsx src/components/MainPage.tsx
git commit -m "feat: ask the encyclopedia with LLM-powered answers"
```

---

### Task 16: Generation Loading UI

**Files:**
- Create: `src/components/GenerateForm.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create generate form with polling**

Create `src/components/GenerateForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { GenerationStatus } from "@/lib/types";

export default function GenerateForm() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [error, setError] = useState("");

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setError("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to start generation");
        return;
      }

      // Poll for status
      const poll = setInterval(async () => {
        const statusRes = await fetch("/api/status");
        const statusData: GenerationStatus = await statusRes.json();
        setStatus(statusData);

        if (statusData.phase === "complete") {
          clearInterval(poll);
          window.location.reload();
        }
        if (statusData.phase === "error") {
          clearInterval(poll);
          setError(statusData.error || "Generation failed");
        }
      }, 1000);
    } catch {
      setError("Failed to connect to server");
    }
  }

  return (
    <div style={{ textAlign: "center", padding: "80px 20px" }}>
      <h1 style={{ fontSize: "28px", marginBottom: "8px", fontFamily: "'Linux Libertine', Georgia, serif" }}>WikiPeople</h1>
      <p style={{ marginBottom: "24px", color: "#54595d", fontFamily: "sans-serif", fontSize: "14px" }}>
        Paste a LinkedIn URL. Get your own Wikipedia.
      </p>

      {!status && (
        <form onSubmit={handleGenerate} style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="linkedin.com/in/yourname"
            style={{ padding: "8px 12px", border: "2px solid #36c", borderRadius: "4px", width: "400px", fontSize: "14px" }}
          />
          <button
            type="submit"
            style={{ background: "#36c", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "4px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
          >
            Generate Wiki
          </button>
        </form>
      )}

      {status && status.phase !== "complete" && (
        <div style={{ fontFamily: "sans-serif", fontSize: "14px" }}>
          <p style={{ marginBottom: "8px" }}>
            <b>{status.phase === "fetching" ? "Fetching LinkedIn profile..." :
                 status.phase === "planning" ? "Planning articles..." :
                 status.phase === "generating" ? `Generating articles (${status.completedArticles}/${status.totalArticles})...` :
                 "Finalizing..."}</b>
          </p>
          {status.currentArticle && (
            <p style={{ color: "#54595d", fontSize: "12px" }}>Current: {status.currentArticle}</p>
          )}
          <div style={{ width: "300px", height: "4px", background: "#e8e8e8", borderRadius: "2px", margin: "12px auto" }}>
            <div style={{
              width: `${status.totalArticles > 0 ? (status.completedArticles / status.totalArticles) * 100 : 10}%`,
              height: "100%",
              background: "#36c",
              borderRadius: "2px",
              transition: "width 0.3s",
            }} />
          </div>
        </div>
      )}

      {error && <p style={{ color: "#ba0000", marginTop: "12px", fontFamily: "sans-serif", fontSize: "13px" }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Update page.tsx to use GenerateForm**

In `src/app/page.tsx`, replace the inline form in the `!data` branch with:

```tsx
import GenerateForm from "@/components/GenerateForm";
// ... in the !data branch:
return <GenerateForm />;
```

- [ ] **Step 3: Verify the full flow**

```bash
npm run dev
```

Open `http://localhost:3000` — should see the generate form. (Testing the full flow requires real API keys.)

- [ ] **Step 4: Commit**

```bash
git add src/components/GenerateForm.tsx src/app/page.tsx
git commit -m "feat: generation loading UI with progress polling"
```

---

### Task 17: Enrich API Route

**Files:**
- Create: `src/app/api/enrich/route.ts`

- [ ] **Step 1: Create enrich route**

Create `src/app/api/enrich/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { listArticles, readArticle, writeArticle } from "@/lib/wiki-io";
import { generateText } from "@/lib/llm";
import fs from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, url, content } = body;

    // Save raw source
    let sourceText = "";
    const rawDir = path.join(process.cwd(), "data/raw/web");
    await fs.mkdir(rawDir, { recursive: true });

    if (type === "web" && url) {
      const res = await fetch(url);
      sourceText = await res.text();
      // Strip HTML tags for plain text
      sourceText = sourceText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 10000);
      const slug = url.replace(/[^a-z0-9]/gi, "-").slice(0, 50);
      await fs.writeFile(path.join(rawDir, `${slug}.json`), JSON.stringify({ url, text: sourceText }), "utf-8");
    } else if (content) {
      sourceText = content.slice(0, 10000);
    }

    if (!sourceText) {
      return NextResponse.json({ error: "No content to process" }, { status: 400 });
    }

    // Read existing index
    const articles = await listArticles();
    const indexSummary = articles.map((a) => `- ${a.title} (${a.slug}): ${a.summary}`).join("\n");

    // Ask LLM which articles to update
    const planPrompt = `Given this new source content and the existing encyclopedia index, which articles should be updated?

New source: ${sourceText.slice(0, 3000)}

Existing articles:
${indexSummary}

Return a JSON array of objects: [{ "slug": "existing/slug", "updateInstructions": "what to add or change" }]
Only include articles that genuinely need updating based on the new information.`;

    const updates = await (await import("@/lib/llm")).generateJSON<{ slug: string; updateInstructions: string }[]>(planPrompt);

    let updatedCount = 0;
    for (const update of (Array.isArray(updates) ? updates : [])) {
      try {
        const article = await readArticle(update.slug);
        const updatePrompt = `Update this Wikipedia article based on new information.

Current article:
${article.content}

Update instructions: ${update.updateInstructions}

Return the complete updated article content in markdown. Keep the same style and format. Add new information naturally into existing sections or create new sections if needed.`;

        const updatedContent = await generateText(updatePrompt);
        article.content = updatedContent;
        article.frontmatter.last_updated = new Date().toISOString();
        await writeArticle(article);
        updatedCount++;
      } catch {
        // Article might not exist
      }
    }

    return NextResponse.json({ updated: updatedCount, total: updates?.length || 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/enrich/route.ts
git commit -m "feat: enrich API route for adding new sources"
```

---

### Task 18: Responsive Polish and Deploy

**Files:**
- Modify: `src/styles/wikipedia.css`
- Create: `vercel.json`

- [ ] **Step 1: Add responsive breakpoints**

Add to `src/styles/wikipedia.css`:

```css
/* Mobile responsive */
@media (max-width: 768px) {
  .wiki-header { flex-wrap: wrap; }
  .wiki-search { width: 100%; max-width: none; margin-top: 4px; }
  .wiki-body { flex-direction: column; }
  .wiki-sidebar { width: 100%; }
  .infobox { float: none; width: 100%; margin: 0 0 16px 0; }
  .grid-2col { flex-direction: column; }
  .portal-bar a { display: inline-block; margin: 2px 4px; }
}
```

- [ ] **Step 2: Create vercel.json**

Create `vercel.json`:

```json
{
  "functions": {
    "src/app/api/generate/route.ts": {
      "maxDuration": 300
    },
    "src/app/api/enrich/route.ts": {
      "maxDuration": 120
    },
    "src/app/api/ask/route.ts": {
      "maxDuration": 30
    }
  }
}
```

- [ ] **Step 3: Test responsive layout**

```bash
npm run dev
```

Open browser DevTools, toggle mobile view. Verify Main Page and article pages render correctly at 375px and 768px widths.

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

Fix any build errors.

- [ ] **Step 5: Commit**

```bash
git add src/styles/wikipedia.css vercel.json
git commit -m "feat: responsive CSS and Vercel deploy config"
```

- [ ] **Step 6: Deploy to Vercel**

```bash
npx vercel --prod
```

Set environment variables in Vercel dashboard: `ANTHROPIC_API_KEY`, `LINKEDIN_API_URL`, `LINKEDIN_API_KEY`.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: ready for deployment"
```
