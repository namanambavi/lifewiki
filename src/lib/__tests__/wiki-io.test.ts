import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { readArticle, writeArticle, listArticles, articleExists, getAllSlugs } from "../wiki-io";

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

  it("checks article existence", async () => {
    const article = {
      slug: "companies/test",
      frontmatter: { title: "Test", type: "company" as const, categories: [], related: [], infobox: {}, sources: [], last_updated: "" },
      content: "Test content",
    };
    await writeArticle(article, TEST_WIKI_DIR);
    expect(await articleExists("companies/test", TEST_WIKI_DIR)).toBe(true);
    expect(await articleExists("companies/nope", TEST_WIKI_DIR)).toBe(false);
  });

  it("gets all slugs from directory", async () => {
    await writeArticle({
      slug: "companies/a",
      frontmatter: { title: "A", type: "company" as const, categories: [], related: [], infobox: {}, sources: [], last_updated: "" },
      content: "A",
    }, TEST_WIKI_DIR);
    await fs.mkdir(path.join(TEST_WIKI_DIR, "technology"), { recursive: true });
    await writeArticle({
      slug: "technology/b",
      frontmatter: { title: "B", type: "technology" as const, categories: [], related: [], infobox: {}, sources: [], last_updated: "" },
      content: "B",
    }, TEST_WIKI_DIR);

    const slugs = await getAllSlugs(TEST_WIKI_DIR);
    expect(slugs).toContain("companies/a");
    expect(slugs).toContain("technology/b");
    expect(slugs).toHaveLength(2);
  });
});
