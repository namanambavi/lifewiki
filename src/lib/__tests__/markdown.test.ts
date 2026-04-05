import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../markdown";

describe("renderMarkdown", () => {
  it("converts basic markdown to HTML", async () => {
    const html = await renderMarkdown("**bold** text");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("resolves wikilinks to internal routes", async () => {
    const existingSlugs = ["companies/google", "people/naman-ambavi"];
    const html = await renderMarkdown("He works at [[Google]] with [[Naman Ambavi]].", existingSlugs);
    expect(html).toContain('href="/wiki/companies/google"');
    expect(html).toContain('href="/wiki/people/naman-ambavi"');
  });

  it("renders missing wikilinks as red links", async () => {
    const html = await renderMarkdown("Visit [[Nonexistent Page]].", []);
    expect(html).toContain('class="wikilink-new"');
  });

  it("converts footnote markers to superscript", async () => {
    const html = await renderMarkdown("A fact.[1] Another.[2]");
    expect(html).toContain("<sup>[1]</sup>");
  });
});
