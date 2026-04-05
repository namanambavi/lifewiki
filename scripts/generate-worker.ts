#!/usr/bin/env npx tsx
/**
 * Generation worker — runs as a separate process from the Next.js server.
 * Spawned by /api/generate, uses the Agent SDK for web research,
 * writes results to data/wiki/ and status to data/generation-status.json.
 *
 * Usage: npx tsx scripts/generate-worker.ts data/raw/linkedin/profile.json
 */

import fs from "fs/promises";
import path from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import matter from "gray-matter";
import Anthropic from "@anthropic-ai/sdk";
import type {
  LinkedInProfile,
  EntityPlan,
  GenerationStatus,
  MainPageData,
  DidYouKnow,
  ArticleFrontmatter,
} from "../src/lib/types";
import schema from "../data/schema.json";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const WIKI_DIR = path.join(process.cwd(), "data/wiki");
const RAW_DIR = path.join(process.cwd(), "data/raw");
const STATUS_FILE = path.join(process.cwd(), "data/generation-status.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

async function updateStatus(status: GenerationStatus): Promise<void> {
  await fs.writeFile(STATUS_FILE, JSON.stringify(status), "utf-8");
}

// ---------------------------------------------------------------------------
// LLM helpers (direct Anthropic SDK, not going through our wrapper)
// ---------------------------------------------------------------------------

const anthropic = new Anthropic();

async function generateText(prompt: string, systemPrompt?: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt || "You are a Wikipedia article writer. Write in a neutral, encyclopedic tone.",
    messages: [{ role: "user", content: prompt }],
  });
  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text : "";
}

async function generateJSON<T>(prompt: string, systemPrompt?: string): Promise<T> {
  const text = await generateText(
    prompt + "\n\nRespond with valid JSON only. No markdown code fences.",
    systemPrompt
  );
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned) as T;
}

// ---------------------------------------------------------------------------
// PHASE 1: Research via Agent SDK
// ---------------------------------------------------------------------------

async function researchPerson(profile: LinkedInProfile): Promise<string> {
  const profileSummary = `
Name: ${profile.name}
Headline: ${profile.headline}
Summary: ${profile.summary}
Location: ${profile.location}

Positions:
${profile.positions.map((p) => `- ${p.title} at ${p.company} (${p.startDate} - ${p.endDate || "present"}): ${p.description}`).join("\n") || "(none provided)"}

Education:
${profile.education.map((e) => `- ${e.degree} in ${e.field} from ${e.school} (${e.startDate} - ${e.endDate})`).join("\n") || "(none provided)"}

Skills: ${profile.skills.join(", ") || "(none provided)"}
  `.trim();

  const researchPrompt = `You are a research agent building a comprehensive personal encyclopedia about ${profile.name}.

Here is their LinkedIn profile:

${profileSummary}

Your task:
1. Search the web for this person — find news mentions, publications, talks, open source projects, interviews
2. Search for each company they worked at — find funding rounds, acquisitions, notable products, key people
3. Search for their educational institutions — notable programs, rankings, famous alumni
4. Fetch any particularly relevant pages for detailed information

After your research, produce a STRUCTURED REPORT with this exact format:

## Research Findings

### About ${profile.name}
(Everything you found about the person beyond what's in their LinkedIn)

### Companies
For each company:
#### [Company Name]
- What the company does
- Key facts (founding, funding, acquisition, size)
- The person's role and contributions
- Notable colleagues

### Education
For each school:
#### [School Name]
- Key facts about the institution
- Relevant programs
- The person's degree and time there

### Technologies & Skills
For each major skill/technology:
#### [Technology Name]
- Brief description
- How the person uses it
- Notable projects involving this technology

### Notable Discoveries
(Anything interesting you found that doesn't fit above — events, publications, projects, awards, life events)

### Suggested Articles
List every entity that deserves its own Wikipedia article, formatted as:
- SLUG: people/${profile.name.toLowerCase().replace(/\s+/g, "-")} | TITLE: ${profile.name} | TYPE: person
- SLUG: companies/[name] | TITLE: [Name] | TYPE: company
(etc. for all entities)

Be thorough. Search at least 5-8 times. The quality of the encyclopedia depends entirely on how much you discover here.`;

  let researchReport = "";

  for await (const message of query({
    prompt: researchPrompt,
    options: {
      allowedTools: ["WebSearch", "WebFetch"],
      maxTurns: 25,
    },
  })) {
    if ("result" in message && typeof message.result === "string") {
      researchReport = message.result;
    }
  }

  // Save research
  const researchDir = path.join(RAW_DIR, "research");
  await fs.mkdir(researchDir, { recursive: true });
  await fs.writeFile(
    path.join(researchDir, `${slugify(profile.name)}-research.md`),
    researchReport,
    "utf-8"
  );

  return researchReport;
}

// ---------------------------------------------------------------------------
// PHASE 1.5: Plan articles from research
// ---------------------------------------------------------------------------

async function planFromResearch(
  profile: LinkedInProfile,
  research: string
): Promise<EntityPlan[]> {
  const planPrompt = `Based on this research about ${profile.name}, create a detailed article plan for their personal encyclopedia.

## Research Report
${research}

## LinkedIn Profile (source of truth for career facts)
Name: ${profile.name}
Positions: ${profile.positions.map((p) => `${p.title} at ${p.company}`).join(", ") || "(none)"}
Education: ${profile.education.map((e) => `${e.degree} from ${e.school}`).join(", ") || "(none)"}
Skills: ${profile.skills.slice(0, 15).join(", ") || "(none)"}
Location: ${profile.location || "(none)"}

## Instructions
Return a JSON array of article plans. Each entry:
{
  "slug": "category/article-name",
  "title": "Article Title",
  "type": "person|company|education|technology|place|career|event|project|publication",
  "dataContext": "ALL relevant information for writing this article — combine LinkedIn data AND research findings."
}

Rules:
- Always include the main person article
- Include companies, schools, skills, locations discovered in research
- Include any events, projects, publications found
- The dataContext must be RICH
- 20-50 articles total`;

  const plan = await generateJSON<EntityPlan[]>(planPrompt);

  if (!Array.isArray(plan) || plan.length === 0) {
    // Minimal fallback
    return [{
      slug: `people/${slugify(profile.name)}`,
      title: profile.name,
      type: "person",
      dataContext: research,
    }];
  }

  return plan;
}

// ---------------------------------------------------------------------------
// PHASE 2: Generate articles
// ---------------------------------------------------------------------------

const pageTypes = schema.page_types as Record<string, { sections: string[]; infobox_fields: string[] }>;

function buildArticlePrompt(entity: EntityPlan, profile: LinkedInProfile, allEntities: EntityPlan[]): string {
  const typeSchema = pageTypes[entity.type] || pageTypes["person"];
  const sections = typeSchema?.sections ?? [];
  const infoboxFields = typeSchema?.infobox_fields ?? [];
  const otherArticles = allEntities.filter((e) => e.slug !== entity.slug).map((e) => `[[${e.title}]]`).join(", ");

  return `You are writing a Wikipedia-style encyclopedia article about "${entity.title}" (type: ${entity.type}).

## Research context
${entity.dataContext}

## Other articles in this encyclopedia (use [[wikilinks]] to cross-reference)
${otherArticles}

## Instructions
1. Write in a neutral, encyclopedic Wikipedia tone.
2. Begin with a bold opening sentence: **${entity.title}** is...
3. Include these sections (use ## headings): ${sections.join(", ")}
4. Use [[wikilinks]] liberally to cross-reference other articles.
5. Use [1], [2] footnote citations.
6. Article length: 200-500 words.
7. Ground the article in the RESEARCH CONTEXT above.

## Output format
Return Markdown with YAML frontmatter:

---
title: "${entity.title}"
type: "${entity.type}"
categories:
  - (relevant categories)
related:
  - (slugs of related articles)
infobox:
${infoboxFields.map((f) => `  ${f}: "..."`).join("\n")}
sources:
  - "[1] Source description"
last_updated: "${todayISO()}"
---

(article body here)

Return raw Markdown directly — no code fences.`;
}

function parseGeneratedArticle(text: string, entity: EntityPlan) {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:markdown|md|yaml)?\n?/, "");
    cleaned = cleaned.replace(/\n?```\s*$/, "");
  }

  try {
    const { data, content } = matter(cleaned);
    if (data && typeof data.title === "string") {
      const fm = data as ArticleFrontmatter;
      fm.type = fm.type || entity.type;
      fm.categories = fm.categories || [];
      fm.related = fm.related || [];
      fm.infobox = fm.infobox || {};
      fm.sources = fm.sources || [];
      fm.last_updated = fm.last_updated || todayISO();
      return { slug: entity.slug, frontmatter: fm, content: content.trim() };
    }
  } catch { /* fall through */ }

  return {
    slug: entity.slug,
    frontmatter: {
      title: entity.title, type: entity.type, categories: [entity.type],
      related: [], infobox: {}, sources: [], last_updated: todayISO(),
    } as ArticleFrontmatter,
    content: cleaned,
  };
}

async function writeArticle(article: { slug: string; frontmatter: ArticleFrontmatter; content: string }) {
  const filePath = path.join(WIKI_DIR, `${article.slug}.md`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const fileContent = matter.stringify(article.content, article.frontmatter);
  await fs.writeFile(filePath, fileContent, "utf-8");
}

// ---------------------------------------------------------------------------
// PHASE 3: Main page + index
// ---------------------------------------------------------------------------

async function generateMainPageData(profile: LinkedInProfile, plan: EntityPlan[]) {
  const firstName = profile.name.split(" ")[0];
  const encyclopediaName = `${firstName}opedia`;

  const didYouKnow = await generateJSON<DidYouKnow[]>(
    `Generate 5 "Did you know..." facts for an encyclopedia about ${profile.name}. Available articles: ${plan.map((e) => `${e.slug} (${e.title})`).join(", ")}. Return JSON: [{"fact":"...that [[Person]]...?","relatedArticles":["slug"]}]`
  );

  const featuredSlug = plan.find((e) => e.type === "person")?.slug ?? plan[0].slug;
  const featuredSummary = await generateText(`Write a 2-3 sentence encyclopedia summary of ${profile.name}. ${profile.headline}. ${profile.summary?.slice(0, 300) || ""}`);

  const portalCounts: Record<string, { count: number; slug: string }> = {};
  for (const e of plan) {
    const name = e.type === "person" ? "People" : e.type === "company" ? "Companies" : e.type === "education" ? "Education" : e.type === "technology" ? "Technology" : e.type === "place" ? "Places" : "Other";
    if (!portalCounts[name]) portalCounts[name] = { count: 0, slug: e.slug };
    portalCounts[name].count++;
  }

  const mainPageData: MainPageData = {
    personName: profile.name,
    encyclopediaName,
    totalArticles: plan.length,
    totalSources: plan.length * 2,
    totalCrossReferences: plan.length * 4,
    featuredArticleSummary: featuredSummary,
    featuredArticleSlug: featuredSlug,
    didYouKnow: Array.isArray(didYouKnow) ? didYouKnow : [],
    portals: Object.entries(portalCounts).map(([name, { count, slug }]) => ({ name, count, slug })),
    recentPeople: (profile.connections || []).slice(0, 5).map((c) => ({ name: c.name, description: c.headline, slug: `people/${slugify(c.name)}` })),
    careerTimeline: profile.positions.map((p) => ({ year: p.startDate, event: `${p.title} at ${p.company}`, slug: `companies/${slugify(p.company)}` })),
  };

  await fs.writeFile(path.join(WIKI_DIR, "main-page.json"), JSON.stringify(mainPageData, null, 2), "utf-8");
}

async function generateIndex(plan: EntityPlan[]) {
  const lines = plan.map((e) => `- [${e.title}](${e.slug}) — Article about ${e.title} | ${e.type} | ${e.type}`);
  await fs.writeFile(path.join(WIKI_DIR, "index.md"), `---\ntitle: Index\n---\n\n# Encyclopedia Index\n\n${lines.join("\n")}\n`, "utf-8");
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  const profilePath = process.argv[2];
  if (!profilePath) {
    console.error("Usage: npx tsx scripts/generate-worker.ts <profile.json>");
    process.exit(1);
  }

  const profileData = JSON.parse(await fs.readFile(profilePath, "utf-8"));
  const profile = profileData as LinkedInProfile;

  console.log(`[worker] Starting encyclopedia generation for ${profile.name}`);

  try {
    // Phase 1: Research
    await updateStatus({ phase: "fetching", totalArticles: 0, completedArticles: 0, currentArticle: "Researching via web search..." });
    console.log("[worker] Phase 1: Researching...");
    const research = await researchPerson(profile);
    console.log(`[worker] Research complete: ${research.length} chars`);

    // Phase 1.5: Plan
    await updateStatus({ phase: "planning", totalArticles: 0, completedArticles: 0, currentArticle: "Planning articles..." });
    console.log("[worker] Phase 1.5: Planning articles...");
    const plan = await planFromResearch(profile, research);
    console.log(`[worker] Planned ${plan.length} articles`);

    // Phase 2: Generate articles
    await updateStatus({ phase: "generating", totalArticles: plan.length, completedArticles: 0, currentArticle: "" });
    console.log("[worker] Phase 2: Generating articles...");

    const BATCH_SIZE = 5;
    let completed = 0;
    for (let i = 0; i < plan.length; i += BATCH_SIZE) {
      const batch = plan.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (entity) => {
          const prompt = buildArticlePrompt(entity, profile, plan);
          const text = await generateText(prompt, "You are a Wikipedia article writer. Write in a neutral, encyclopedic tone. Return raw Markdown with YAML frontmatter — no code fences.");
          return { entity, text };
        })
      );

      for (const { entity, text } of results) {
        const article = parseGeneratedArticle(text, entity);
        await writeArticle(article);
        completed++;
        await updateStatus({ phase: "generating", totalArticles: plan.length, completedArticles: completed, currentArticle: entity.title });
        console.log(`[worker] Generated: ${entity.title} (${completed}/${plan.length})`);
      }
    }

    // Phase 3: Finalize
    await updateStatus({ phase: "finalizing", totalArticles: plan.length, completedArticles: completed, currentArticle: "Main page & index" });
    console.log("[worker] Phase 3: Finalizing...");
    await generateMainPageData(profile, plan);
    await generateIndex(plan);

    // Done
    await updateStatus({ phase: "complete", totalArticles: plan.length, completedArticles: plan.length, currentArticle: "" });
    console.log(`[worker] Done! ${plan.length} articles generated.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[worker] Error:", message);
    await updateStatus({ phase: "error", totalArticles: 0, completedArticles: 0, currentArticle: "", error: message });
    process.exit(1);
  }
}

main();
