import path from "path";
import fs from "fs/promises";
import matter from "gray-matter";
import { generateText, generateJSON, generateBatch } from "./llm";
import { writeArticle } from "./wiki-io";
import type {
  LinkedInProfile,
  EntityPlan,
  GenerationStatus,
  MainPageData,
  DidYouKnow,
  Article,
  ArticleFrontmatter,
  PageType,
} from "./types";
import schema from "../../data/schema.json";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WIKI_DIR = path.join(process.cwd(), "data/wiki");

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
// Module-level mutable status (single-instance, fine for hackathon)
// ---------------------------------------------------------------------------

let status: GenerationStatus = {
  phase: "planning",
  totalArticles: 0,
  completedArticles: 0,
  currentArticle: "",
};

export function getStatus(): GenerationStatus {
  return { ...status };
}

// ---------------------------------------------------------------------------
// 1. Entity planning
// ---------------------------------------------------------------------------

export function planEntities(profile: LinkedInProfile): EntityPlan[] {
  const entities: EntityPlan[] = [];
  const seen = new Set<string>();

  // Person article
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

  // Company articles (deduplicated)
  for (const pos of profile.positions) {
    const companySlug = `companies/${slugify(pos.company)}`;
    if (seen.has(companySlug)) continue;
    seen.add(companySlug);
    entities.push({
      slug: companySlug,
      title: pos.company,
      type: "company",
      dataContext: JSON.stringify({
        company: pos.company,
        roleHeld: pos.title,
        startDate: pos.startDate,
        endDate: pos.endDate,
        description: pos.description,
        personName: profile.name,
      }),
    });
  }

  // Education articles (deduplicated)
  for (const edu of profile.education) {
    const eduSlug = `education/${slugify(edu.school)}`;
    if (seen.has(eduSlug)) continue;
    seen.add(eduSlug);
    entities.push({
      slug: eduSlug,
      title: edu.school,
      type: "education",
      dataContext: JSON.stringify({
        school: edu.school,
        degree: edu.degree,
        field: edu.field,
        startDate: edu.startDate,
        endDate: edu.endDate,
        personName: profile.name,
      }),
    });
  }

  // Top 10 skills
  const topSkills = profile.skills.slice(0, 10);
  for (const skill of topSkills) {
    const skillSlug = `technology/${slugify(skill)}`;
    if (seen.has(skillSlug)) continue;
    seen.add(skillSlug);
    entities.push({
      slug: skillSlug,
      title: skill,
      type: "technology",
      dataContext: JSON.stringify({
        skill,
        personName: profile.name,
        headline: profile.headline,
      }),
    });
  }

  // Location article
  if (profile.location) {
    const locationSlug = `places/${slugify(profile.location)}`;
    if (!seen.has(locationSlug)) {
      seen.add(locationSlug);
      entities.push({
        slug: locationSlug,
        title: profile.location,
        type: "place",
        dataContext: JSON.stringify({
          location: profile.location,
          personName: profile.name,
          companies: profile.positions.map((p) => p.company),
        }),
      });
    }
  }

  // Career timeline
  const timelineSlug = "career/timeline";
  if (!seen.has(timelineSlug)) {
    seen.add(timelineSlug);
    entities.push({
      slug: timelineSlug,
      title: `${profile.name} — Career Timeline`,
      type: "career",
      dataContext: JSON.stringify({
        personName: profile.name,
        positions: profile.positions,
        education: profile.education,
        skills: profile.skills.slice(0, 10),
      }),
    });
  }

  return entities;
}

// ---------------------------------------------------------------------------
// 2. Article prompt builder
// ---------------------------------------------------------------------------

const pageTypes = schema.page_types as Record<
  string,
  { sections: string[]; infobox_fields: string[] }
>;

export function buildArticlePrompt(
  entity: EntityPlan,
  profile: LinkedInProfile
): string {
  const typeSchema = pageTypes[entity.type];
  const sections = typeSchema?.sections ?? [];
  const infoboxFields = typeSchema?.infobox_fields ?? [];

  // Build a list of all other article titles for cross-linking hints
  // (not passed via arguments; caller doesn't need to supply the full plan)
  const otherEntities: string[] = [];

  return `You are writing a Wikipedia-style encyclopedia article about "${entity.title}" (type: ${entity.type}).

## Source data
${entity.dataContext}

## Full profile context
Person: ${profile.name}
Headline: ${profile.headline}
Location: ${profile.location}

## Instructions
1. Write in a neutral, encyclopedic Wikipedia tone.
2. Begin the article body with a bold opening sentence: **${entity.title}** is...
3. Include these sections (use ## headings): ${sections.join(", ")}
4. Use [[wikilinks]] to cross-reference other articles about this person's companies, schools, skills, and locations.
5. Use [1], [2], etc. footnote-style citations. Invent plausible sources (company websites, news, Wikipedia).
6. Article length: 150-400 words of body content.

## Output format
Return the article as Markdown with YAML frontmatter. The frontmatter MUST include:

\`\`\`
---
title: "${entity.title}"
type: "${entity.type}"
categories:
  - (relevant categories)
related:
  - (slugs of related articles, e.g. "companies/google", "people/john-doe")
infobox:
${infoboxFields.map((f) => `  ${f}: "..."`).join("\n")}
sources:
  - "[1] Source description (URL)"
  - "[2] Source description (URL)"
last_updated: "${todayISO()}"
---
\`\`\`

Then write the full article body in Markdown below the frontmatter.
Do NOT wrap the output in code fences — return raw Markdown directly.`;
}

// ---------------------------------------------------------------------------
// 3. Parse generated article
// ---------------------------------------------------------------------------

export function parseGeneratedArticle(
  text: string,
  entity: EntityPlan
): Article {
  // Strip any wrapping code fences the LLM may have added
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:markdown|md|yaml)?\n?/, "");
    cleaned = cleaned.replace(/\n?```\s*$/, "");
  }

  try {
    const { data, content } = matter(cleaned);
    // Validate that we got at least a title
    if (data && typeof data.title === "string") {
      const fm = data as ArticleFrontmatter;
      // Ensure required fields have fallback values
      fm.type = fm.type || entity.type;
      fm.categories = fm.categories || [];
      fm.related = fm.related || [];
      fm.infobox = fm.infobox || {};
      fm.sources = fm.sources || [];
      fm.last_updated = fm.last_updated || todayISO();
      return { slug: entity.slug, frontmatter: fm, content: content.trim() };
    }
  } catch {
    // fall through to fallback
  }

  // Fallback: create minimal frontmatter and use entire text as content
  const fallbackFrontmatter: ArticleFrontmatter = {
    title: entity.title,
    type: entity.type,
    categories: [entity.type],
    related: [],
    infobox: {},
    sources: [],
    last_updated: todayISO(),
  };
  return {
    slug: entity.slug,
    frontmatter: fallbackFrontmatter,
    content: cleaned,
  };
}

// ---------------------------------------------------------------------------
// 4. Main-page data generation
// ---------------------------------------------------------------------------

export async function generateMainPageData(
  profile: LinkedInProfile,
  plan: EntityPlan[]
): Promise<void> {
  const firstName = profile.name.split(" ")[0];
  const encyclopediaName = `${firstName}opedia`;

  // Generate "Did you know..." facts via LLM
  const factsPrompt = `Based on this person's profile, generate 5 fun "Did you know..." facts for an encyclopedia main page.

Person: ${profile.name}
Headline: ${profile.headline}
Summary: ${profile.summary}
Skills: ${profile.skills.slice(0, 10).join(", ")}
Companies: ${profile.positions.map((p) => p.company).join(", ")}
Education: ${profile.education.map((e) => e.school).join(", ")}

Available article slugs for linking:
${plan.map((e) => `- ${e.slug} (${e.title})`).join("\n")}

Return a JSON array of objects with "fact" (string) and "relatedArticles" (array of slug strings).
Example: [{"fact": "...that X worked at 5 different companies?", "relatedArticles": ["companies/acme"]}]`;

  const didYouKnow = await generateJSON<DidYouKnow[]>(factsPrompt);

  // Generate featured article summary
  const personEntity = plan.find((e) => e.type === "person");
  const featuredSlug = personEntity?.slug ?? plan[0].slug;
  const featuredSummary = await generateText(
    `Write a 2-3 sentence encyclopedia-style summary of ${profile.name} based on: ${profile.headline}. ${profile.summary}. Keep it factual and concise.`
  );

  // Build portals from entity types
  const portalCounts: Record<string, { count: number; slug: string }> = {};
  for (const e of plan) {
    const portalName =
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
                : "Career";
    if (!portalCounts[portalName]) {
      portalCounts[portalName] = { count: 0, slug: e.slug };
    }
    portalCounts[portalName].count++;
  }
  const portals = Object.entries(portalCounts).map(([name, { count, slug }]) => ({
    name,
    count,
    slug,
  }));

  // Recent people from connections
  const recentPeople = (profile.connections || []).slice(0, 5).map((c) => ({
    name: c.name,
    description: c.headline,
    slug: `people/${slugify(c.name)}`,
  }));

  // Career timeline from positions
  const careerTimeline = profile.positions.map((p) => ({
    year: p.startDate,
    event: `${p.title} at ${p.company}`,
    slug: `companies/${slugify(p.company)}`,
  }));

  const mainPageData: MainPageData = {
    personName: profile.name,
    encyclopediaName,
    totalArticles: plan.length,
    totalSources: plan.length * 2, // estimate
    totalCrossReferences: plan.length * 3, // estimate
    featuredArticleSummary: featuredSummary,
    featuredArticleSlug: featuredSlug,
    didYouKnow,
    portals,
    recentPeople,
    careerTimeline,
  };

  await fs.mkdir(WIKI_DIR, { recursive: true });
  await fs.writeFile(
    path.join(WIKI_DIR, "main-page.json"),
    JSON.stringify(mainPageData, null, 2),
    "utf-8"
  );
}

// ---------------------------------------------------------------------------
// 5. Index generation
// ---------------------------------------------------------------------------

export async function generateIndex(plan: EntityPlan[]): Promise<void> {
  const lines = plan.map((e) => {
    const summary = `Article about ${e.title}`;
    const categories = e.type;
    return `- [${e.title}](${e.slug}) — ${summary} | ${e.type} | ${categories}`;
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
// 6. Main pipeline
// ---------------------------------------------------------------------------

export async function generateEncyclopedia(
  profile: LinkedInProfile
): Promise<void> {
  try {
    // ---- Phase 1: Planning ----
    status = {
      phase: "planning",
      totalArticles: 0,
      completedArticles: 0,
      currentArticle: "",
    };

    const plan = planEntities(profile);

    status.totalArticles = plan.length;

    // ---- Phase 2: Generating articles ----
    status.phase = "generating";

    // Build all prompts
    const prompts = plan.map((entity) => ({
      id: entity.slug,
      prompt: buildArticlePrompt(entity, profile),
      systemPrompt:
        "You are a Wikipedia article writer. Write in a neutral, encyclopedic tone. Return raw Markdown with YAML frontmatter — no code fences.",
    }));

    // generateBatch already handles batching in groups of 5
    // We wrap it to track per-article progress
    const BATCH_SIZE = 5;
    for (let i = 0; i < prompts.length; i += BATCH_SIZE) {
      const batch = prompts.slice(i, i + BATCH_SIZE);
      const batchResults = await generateBatch(batch);

      for (const entity of plan.slice(i, i + BATCH_SIZE)) {
        status.currentArticle = entity.title;
        const rawText = batchResults.get(entity.slug);
        if (!rawText) continue;

        const article = parseGeneratedArticle(rawText, entity);
        await writeArticle(article);
        status.completedArticles++;
      }
    }

    // ---- Phase 3: Finalizing ----
    status.phase = "finalizing";
    status.currentArticle = "Main page & index";

    await generateMainPageData(profile, plan);
    await generateIndex(plan);

    // ---- Done ----
    status.phase = "complete";
    status.currentArticle = "";
  } catch (err: unknown) {
    status.phase = "error";
    status.error =
      err instanceof Error ? err.message : "Unknown error during generation";
    throw err;
  }
}
