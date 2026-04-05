import path from "path";
import fs from "fs/promises";
import matter from "gray-matter";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { generateText, generateJSON, generateBatch } from "./llm";
import { writeArticle } from "./wiki-io";
import type {
  LinkedInProfile,
  EntityPlan,
  GenerationStatus,
  MainPageData,
  DidYouKnow,
  ArticleFrontmatter,
} from "./types";
import schema from "../../data/schema.json";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WIKI_DIR = path.join(process.cwd(), "data/wiki");
const RAW_DIR = path.join(process.cwd(), "data/raw");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Module-level status (single-instance, fine for hackathon)
// ---------------------------------------------------------------------------

let status: GenerationStatus = {
  phase: "complete",
  totalArticles: 0,
  completedArticles: 0,
  currentArticle: "",
};

export function getStatus(): GenerationStatus {
  return { ...status };
}

// ---------------------------------------------------------------------------
// PHASE 1: Research via Claude Agent SDK
//
// Uses the Agent SDK with built-in WebSearch + WebFetch tools.
// The agent researches the person, their companies, projects, etc.
// and returns a structured research report.
//
// No custom tool loop needed — the SDK handles everything.
// ---------------------------------------------------------------------------

async function researchPerson(profile: LinkedInProfile): Promise<string> {
  const profileSummary = `
Name: ${profile.name}
Headline: ${profile.headline}
Summary: ${profile.summary}
Location: ${profile.location}

Positions:
${profile.positions.map((p) => `- ${p.title} at ${p.company} (${p.startDate} - ${p.endDate || "present"}): ${p.description}`).join("\n")}

Education:
${profile.education.map((e) => `- ${e.degree} in ${e.field} from ${e.school} (${e.startDate} - ${e.endDate})`).join("\n")}

Skills: ${profile.skills.join(", ")}

Connections (sample): ${profile.connections.slice(0, 20).map((c) => `${c.name} (${c.headline})`).join(", ")}
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
    // Collect the final result
    if ("result" in message && typeof message.result === "string") {
      researchReport = message.result;
    }
  }

  // Save the raw research to disk
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
// PHASE 1.5: Parse research into entity plan
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
Positions: ${profile.positions.map((p) => `${p.title} at ${p.company}`).join(", ")}
Education: ${profile.education.map((e) => `${e.degree} from ${e.school}`).join(", ")}
Skills: ${profile.skills.slice(0, 15).join(", ")}
Location: ${profile.location}

## Instructions
Return a JSON array of article plans. Each entry:
{
  "slug": "category/article-name" (e.g. "companies/google", "people/naman-ambavi"),
  "title": "Article Title",
  "type": "person|company|education|technology|place|career|event|project|publication",
  "dataContext": "ALL relevant information for writing this article — combine LinkedIn data AND research findings. This is the ONLY input the article writer sees, so include everything."
}

Rules:
- Always include: 1 main person article, 1 per company, 1 per school, top 10 skills, location, career timeline
- Also include any events, projects, publications, or notable entities discovered in research
- The dataContext must be RICH — include specific facts, dates, numbers from the research
- 30-60 articles total for a thorough encyclopedia`;

  const plan = await generateJSON<EntityPlan[]>(planPrompt);

  if (!Array.isArray(plan) || plan.length === 0) {
    return fallbackPlan(profile);
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Fallback if the agent or planning fails
// ---------------------------------------------------------------------------

function fallbackPlan(profile: LinkedInProfile): EntityPlan[] {
  const entities: EntityPlan[] = [];
  const seen = new Set<string>();

  const personSlug = `people/${slugify(profile.name)}`;
  entities.push({
    slug: personSlug,
    title: profile.name,
    type: "person",
    dataContext: JSON.stringify({
      name: profile.name,
      headline: profile.headline,
      summary: profile.summary,
      location: profile.location,
      positions: profile.positions,
      education: profile.education,
      skills: profile.skills.slice(0, 10),
    }),
  });
  seen.add(personSlug);

  for (const pos of profile.positions) {
    const slug = `companies/${slugify(pos.company)}`;
    if (!seen.has(slug)) {
      seen.add(slug);
      entities.push({
        slug,
        title: pos.company,
        type: "company",
        dataContext: JSON.stringify({
          company: pos.company,
          role: pos.title,
          dates: `${pos.startDate} - ${pos.endDate || "present"}`,
        }),
      });
    }
  }

  for (const edu of profile.education) {
    const slug = `education/${slugify(edu.school)}`;
    if (!seen.has(slug)) {
      seen.add(slug);
      entities.push({
        slug,
        title: edu.school,
        type: "education",
        dataContext: JSON.stringify({
          school: edu.school,
          degree: edu.degree,
          field: edu.field,
        }),
      });
    }
  }

  for (const skill of profile.skills.slice(0, 10)) {
    const slug = `technology/${slugify(skill)}`;
    if (!seen.has(slug)) {
      seen.add(slug);
      entities.push({
        slug,
        title: skill,
        type: "technology",
        dataContext: JSON.stringify({ skill }),
      });
    }
  }

  if (profile.location) {
    const slug = `places/${slugify(profile.location)}`;
    if (!seen.has(slug)) {
      entities.push({
        slug,
        title: profile.location,
        type: "place",
        dataContext: JSON.stringify({ location: profile.location }),
      });
    }
  }

  entities.push({
    slug: "career/timeline",
    title: `${profile.name} — Career Timeline`,
    type: "career",
    dataContext: JSON.stringify({
      positions: profile.positions,
      education: profile.education,
    }),
  });

  return entities;
}

// ---------------------------------------------------------------------------
// PHASE 2: Compilation — generate articles from research
// ---------------------------------------------------------------------------

const pageTypes = schema.page_types as Record<
  string,
  { sections: string[]; infobox_fields: string[] }
>;

export function buildArticlePrompt(
  entity: EntityPlan,
  profile: LinkedInProfile,
  allEntities: EntityPlan[]
): string {
  const typeSchema = pageTypes[entity.type] || pageTypes["person"];
  const sections = typeSchema?.sections ?? [];
  const infoboxFields = typeSchema?.infobox_fields ?? [];

  const otherArticles = allEntities
    .filter((e) => e.slug !== entity.slug)
    .map((e) => `[[${e.title}]]`)
    .join(", ");

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
5. Use [1], [2] footnote citations. Cite actual sources from the research context.
6. Article length: 200-500 words.
7. Ground the article in the RESEARCH CONTEXT above. Do not invent unsupported facts.

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

export function parseGeneratedArticle(
  text: string,
  entity: EntityPlan
): { slug: string; frontmatter: ArticleFrontmatter; content: string } {
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
  } catch {
    // fall through
  }

  return {
    slug: entity.slug,
    frontmatter: {
      title: entity.title,
      type: entity.type,
      categories: [entity.type],
      related: [],
      infobox: {},
      sources: [],
      last_updated: todayISO(),
    },
    content: cleaned,
  };
}

// ---------------------------------------------------------------------------
// Main Page + Index generation
// ---------------------------------------------------------------------------

export async function generateMainPageData(
  profile: LinkedInProfile,
  plan: EntityPlan[]
): Promise<void> {
  const firstName = profile.name.split(" ")[0];
  const encyclopediaName = `${firstName}opedia`;

  const factsPrompt = `Based on this person's profile and encyclopedia articles, generate 5 interesting "Did you know..." facts.

Person: ${profile.name}
Headline: ${profile.headline}
Companies: ${profile.positions.map((p) => p.company).join(", ")}
Education: ${profile.education.map((e) => e.school).join(", ")}

Available articles for linking:
${plan.map((e) => `- ${e.slug} (${e.title})`).join("\n")}

Return a JSON array: [{"fact": "...that [[Person]] did X at [[Company]]?", "relatedArticles": ["slug1"]}]
Make facts specific, surprising, and use [[wikilinks]].`;

  const didYouKnow = await generateJSON<DidYouKnow[]>(factsPrompt);

  const featuredSlug =
    plan.find((e) => e.type === "person")?.slug ?? plan[0].slug;
  const featuredSummary = await generateText(
    `Write a 2-3 sentence encyclopedia summary of ${profile.name}. ${profile.headline}. ${profile.summary?.slice(0, 300) || ""}`
  );

  const portalCounts: Record<string, { count: number; slug: string }> = {};
  for (const e of plan) {
    const name =
      e.type === "person"
        ? "People"
        : e.type === "company"
          ? "Companies"
          : e.type === "education"
            ? "Education"
            : e.type === "technology"
              ? "Technology"
              : e.type === "place"
                ? "Places"
                : e.type === "event"
                  ? "Events"
                  : e.type === "project"
                    ? "Projects"
                    : e.type === "publication"
                      ? "Publications"
                      : "Career";
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
    portals: Object.entries(portalCounts).map(([name, { count, slug }]) => ({
      name,
      count,
      slug,
    })),
    recentPeople: (profile.connections || []).slice(0, 5).map((c) => ({
      name: c.name,
      description: c.headline,
      slug: `people/${slugify(c.name)}`,
    })),
    careerTimeline: profile.positions.map((p) => ({
      year: p.startDate,
      event: `${p.title} at ${p.company}`,
      slug: `companies/${slugify(p.company)}`,
    })),
  };

  await fs.mkdir(WIKI_DIR, { recursive: true });
  await fs.writeFile(
    path.join(WIKI_DIR, "main-page.json"),
    JSON.stringify(mainPageData, null, 2),
    "utf-8"
  );
}

export async function generateIndex(plan: EntityPlan[]): Promise<void> {
  const lines = plan.map((e) => {
    return `- [${e.title}](${e.slug}) — Article about ${e.title} | ${e.type} | ${e.type}`;
  });

  const indexContent = `---
title: Index
---

# Encyclopedia Index

${lines.join("\n")}
`;

  await fs.mkdir(WIKI_DIR, { recursive: true });
  await fs.writeFile(path.join(WIKI_DIR, "index.md"), indexContent, "utf-8");
}

// ---------------------------------------------------------------------------
// MAIN PIPELINE
//
// Phase 1: Agent SDK researches the person (WebSearch + WebFetch)
// Phase 1.5: LLM plans articles from research findings
// Phase 2: Batch-generate all articles from the plan
// Phase 3: Generate main page + index
// ---------------------------------------------------------------------------

export async function generateEncyclopedia(
  profile: LinkedInProfile
): Promise<void> {
  try {
    // ================================================================
    // PHASE 1: Research via Claude Agent SDK
    // The agent autonomously searches the web, fetches pages, and
    // compiles a research report about the person.
    // ================================================================
    status = {
      phase: "fetching",
      totalArticles: 0,
      completedArticles: 0,
      currentArticle:
        "Researching — the agent is searching the web for information...",
    };

    const research = await researchPerson(profile);

    // ================================================================
    // PHASE 1.5: Plan articles from research
    // LLM reads the research report + LinkedIn profile and plans
    // which articles to create, with rich context for each.
    // ================================================================
    status.phase = "planning";
    status.currentArticle = "Planning articles from research findings...";

    const plan = await planFromResearch(profile, research);
    status.totalArticles = plan.length;

    // ================================================================
    // PHASE 2: Generate articles
    // Each article is written with the full research context.
    // ================================================================
    status.phase = "generating";

    const systemPrompt =
      "You are a Wikipedia article writer. Write in a neutral, encyclopedic tone. Return raw Markdown with YAML frontmatter — no code fences. Ground every claim in the research context provided.";

    const BATCH_SIZE = 5;
    for (let i = 0; i < plan.length; i += BATCH_SIZE) {
      const batch = plan.slice(i, i + BATCH_SIZE);
      const prompts = batch.map((entity) => ({
        id: entity.slug,
        prompt: buildArticlePrompt(entity, profile, plan),
        systemPrompt,
      }));

      const batchResults = await generateBatch(prompts);

      for (const entity of batch) {
        status.currentArticle = entity.title;
        const rawText = batchResults.get(entity.slug);
        if (!rawText) continue;

        const article = parseGeneratedArticle(rawText, entity);
        await writeArticle(article);
        status.completedArticles++;
      }
    }

    // ================================================================
    // PHASE 3: Finalize
    // ================================================================
    status.phase = "finalizing";
    status.currentArticle = "Main page & index";

    await generateMainPageData(profile, plan);
    await generateIndex(plan);

    status.phase = "complete";
    status.currentArticle = "";
  } catch (err: unknown) {
    status.phase = "error";
    status.error =
      err instanceof Error ? err.message : "Unknown error during generation";
    throw err;
  }
}
