import { describe, it, expect } from "vitest";
import { buildArticlePrompt, parseGeneratedArticle } from "../wiki-engine";
import type { EntityPlan, LinkedInProfile } from "../types";

const mockProfile: LinkedInProfile = {
  name: "Test Person",
  headline: "Software Engineer",
  summary: "A test person",
  location: "San Francisco, CA",
  positions: [
    { title: "Engineer", company: "TestCorp", startDate: "2020", endDate: null, description: "Building things" },
  ],
  education: [
    { school: "Test University", degree: "BS", field: "Computer Science", startDate: "2016", endDate: "2020" },
  ],
  skills: ["TypeScript", "React"],
  connections: [],
};

const mockEntity: EntityPlan = {
  slug: "companies/testcorp",
  title: "TestCorp",
  type: "company",
  dataContext: "TestCorp is a software company founded in 2018.",
};

const allEntities: EntityPlan[] = [
  mockEntity,
  { slug: "people/test-person", title: "Test Person", type: "person", dataContext: "A person" },
  { slug: "technology/typescript", title: "TypeScript", type: "technology", dataContext: "A language" },
];

describe("buildArticlePrompt", () => {
  it("returns correct format with sections and wikilinks", () => {
    const prompt = buildArticlePrompt(mockEntity, mockProfile, allEntities);

    // Should contain the entity title
    expect(prompt).toContain('"TestCorp"');
    expect(prompt).toContain("type: company");

    // Should contain research context
    expect(prompt).toContain("TestCorp is a software company founded in 2018.");

    // Should contain wikilinks to OTHER articles (not self)
    expect(prompt).toContain("[[Test Person]]");
    expect(prompt).toContain("[[TypeScript]]");
    expect(prompt).not.toContain("[[TestCorp]]");

    // Should contain company sections from schema
    expect(prompt).toContain("History");
    expect(prompt).toContain("Products and services");
    expect(prompt).toContain("Key people");

    // Should contain company infobox fields
    expect(prompt).toContain("industry:");
    expect(prompt).toContain("founded:");
  });
});

describe("parseGeneratedArticle", () => {
  it("handles valid frontmatter", () => {
    const text = `---
title: "TestCorp"
type: "company"
categories:
  - Companies
  - Technology
related:
  - people/test-person
infobox:
  industry: "Software"
  founded: "2018"
sources:
  - "[1] Company website"
last_updated: "2026-01-01"
---

**TestCorp** is a software company.

## History

Founded in 2018.`;

    const result = parseGeneratedArticle(text, mockEntity);

    expect(result.slug).toBe("companies/testcorp");
    expect(result.frontmatter.title).toBe("TestCorp");
    expect(result.frontmatter.type).toBe("company");
    expect(result.frontmatter.categories).toContain("Companies");
    expect(result.frontmatter.infobox.industry).toBe("Software");
    expect(result.content).toContain("**TestCorp** is a software company.");
    expect(result.content).toContain("## History");
  });

  it("handles missing frontmatter (fallback)", () => {
    const text = "**TestCorp** is a software company without any frontmatter.";

    const result = parseGeneratedArticle(text, mockEntity);

    expect(result.slug).toBe("companies/testcorp");
    expect(result.frontmatter.title).toBe("TestCorp");
    expect(result.frontmatter.type).toBe("company");
    expect(result.frontmatter.categories).toEqual(["company"]);
    expect(result.content).toContain("**TestCorp** is a software company");
  });

  it("strips code fences", () => {
    const text = "```markdown\n---\ntitle: \"TestCorp\"\ntype: \"company\"\ncategories: []\nrelated: []\ninfobox: {}\nsources: []\nlast_updated: \"2026-01-01\"\n---\n\n**TestCorp** is great.\n```";

    const result = parseGeneratedArticle(text, mockEntity);

    expect(result.frontmatter.title).toBe("TestCorp");
    expect(result.content).toContain("**TestCorp** is great.");
    // Should not contain code fence markers
    expect(result.content).not.toContain("```");
  });
});
