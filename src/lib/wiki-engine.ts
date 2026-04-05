import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import matter from "gray-matter";
import { generateText, generateJSON } from "./llm";
import { getWikiDir } from "./wiki-io";
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

const USERS_DIR = path.join(process.cwd(), "data/users");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export function getStatus(personSlug: string): GenerationStatus {
  const statusPath = path.join(USERS_DIR, personSlug, "generation-status.json");
  try {
    const raw = fsSync.readFileSync(statusPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {
      phase: "complete",
      totalArticles: 0,
      completedArticles: 0,
      currentArticle: "",
    };
  }
}

// ---------------------------------------------------------------------------
// PHASE 1.5: Parse research into entity plan
// ---------------------------------------------------------------------------

export async function planFromResearch(
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
  plan: EntityPlan[],
  personSlug: string
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

  const wikiDir = getWikiDir(personSlug);
  await fs.mkdir(wikiDir, { recursive: true });
  await fs.writeFile(
    path.join(wikiDir, "main-page.json"),
    JSON.stringify(mainPageData, null, 2),
    "utf-8"
  );
}

export async function generateIndex(plan: EntityPlan[], personSlug: string): Promise<void> {
  const lines = plan.map((e) => {
    return `- [${e.title}](${e.slug}) — Article about ${e.title} | ${e.type} | ${e.type}`;
  });

  const indexContent = `---
title: Index
---

# Encyclopedia Index

${lines.join("\n")}
`;

  const wikiDir = getWikiDir(personSlug);
  await fs.mkdir(wikiDir, { recursive: true });
  await fs.writeFile(path.join(wikiDir, "index.md"), indexContent, "utf-8");
}
