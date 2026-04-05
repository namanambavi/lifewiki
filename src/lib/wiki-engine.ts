import path from "path";
import fs from "fs/promises";
import matter from "gray-matter";
import { generateText, generateJSON, generateBatch, runAgent } from "./llm";
import { writeArticle } from "./wiki-io";
import type {
  LinkedInProfile,
  EntityPlan,
  GenerationStatus,
  MainPageData,
  DidYouKnow,
  ArticleFrontmatter,
  PageType,
} from "./types";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
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
// PHASE 1: Agentic Source Gathering
//
// The LLM agent reads the LinkedIn profile, then uses web_search to research
// the person, their companies, projects, publications, and anything else
// worth covering. Each discovery is saved to raw/ as a source file.
// The agent then plans which articles to create based on ALL gathered sources.
// ---------------------------------------------------------------------------

const RESEARCH_TOOLS: Tool[] = [
  {
    name: "web_search",
    description:
      "Search the web for information about a person, company, project, publication, or topic. Use this to discover things the LinkedIn profile doesn't mention — acquisitions, publications, conference talks, news mentions, open source contributions, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "save_source",
    description:
      "Save a discovered piece of information as a source file. Call this for every meaningful fact or context you find — it will be used when compiling the wiki articles.",
    input_schema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description:
            "Short identifier for this source, e.g. 'google-acquisition-2024' or 'naman-tensorflow-talk'",
        },
        title: {
          type: "string",
          description: "Human-readable title for this source",
        },
        content: {
          type: "string",
          description: "The full text content of this source",
        },
        url: {
          type: "string",
          description: "URL where this was found (if applicable)",
        },
        relevantTo: {
          type: "array",
          items: { type: "string" },
          description:
            "Which entities this is relevant to, e.g. ['Google', 'Naman Ambavi', 'TensorFlow']",
        },
      },
      required: ["slug", "title", "content", "relevantTo"],
    },
  },
  {
    name: "plan_article",
    description:
      "Add an article to the encyclopedia plan. Call this for every entity that deserves its own Wikipedia page. Include ALL context you've gathered from the profile AND from web searches.",
    input_schema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description:
            "Path for this article, e.g. 'companies/google', 'people/naman-ambavi', 'technology/tensorflow'",
        },
        title: {
          type: "string",
          description: "Article title as it would appear on Wikipedia",
        },
        type: {
          type: "string",
          enum: [
            "person",
            "company",
            "education",
            "technology",
            "place",
            "career",
            "event",
            "project",
            "publication",
          ],
          description: "The type of entity",
        },
        dataContext: {
          type: "string",
          description:
            "ALL known information about this entity — from LinkedIn profile AND from web search results. This is the ONLY input the article writer will see, so include everything relevant.",
        },
        reasoning: {
          type: "string",
          description:
            "Why this article belongs in the encyclopedia. What makes it interesting or important in this person's story.",
        },
        sourceSlugs: {
          type: "array",
          items: { type: "string" },
          description:
            "Which source files (from save_source) are relevant to this article",
        },
      },
      required: ["slug", "title", "type", "dataContext", "reasoning"],
    },
  },
  {
    name: "done_planning",
    description:
      "Call this when you have finished researching and planning all articles. Summarize what you found and what the encyclopedia will cover.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: {
          type: "string",
          description:
            "Summary of research findings and the planned encyclopedia structure",
        },
        totalArticles: {
          type: "number",
          description: "Total number of articles planned",
        },
      },
      required: ["summary", "totalArticles"],
    },
  },
];

async function webSearch(query: string): Promise<string> {
  // Use a web search API. For hackathon, we use a simple fetch to a search API.
  // If no search API is configured, fall back to telling the LLM to use its knowledge.
  const searchApiUrl = process.env.SEARCH_API_URL;
  const searchApiKey = process.env.SEARCH_API_KEY;

  if (searchApiUrl && searchApiKey) {
    try {
      const response = await fetch(
        `${searchApiUrl}?q=${encodeURIComponent(query)}&count=5`,
        {
          headers: { Authorization: `Bearer ${searchApiKey}` },
        }
      );
      if (response.ok) {
        const data = await response.json();
        // Normalize search results — adapt to your search API's response format
        const results = Array.isArray(data.results)
          ? data.results
          : Array.isArray(data.web?.results)
            ? data.web.results
            : [];
        return results
          .slice(0, 5)
          .map(
            (r: { title?: string; url?: string; snippet?: string; description?: string }) =>
              `Title: ${r.title || "N/A"}\nURL: ${r.url || "N/A"}\nSnippet: ${r.snippet || r.description || "N/A"}`
          )
          .join("\n\n---\n\n");
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: no search API configured. Tell the LLM to use its training data.
  return `[No web search API configured. Use your training knowledge about "${query}" to provide relevant information. Note in the article that some information comes from general knowledge rather than verified sources.]`;
}

interface GatheredSource {
  slug: string;
  title: string;
  content: string;
  url?: string;
  relevantTo: string[];
}

async function gatherSourcesAndPlan(
  profile: LinkedInProfile
): Promise<{ plan: EntityPlan[]; sources: GatheredSource[] }> {
  const sources: GatheredSource[] = [];
  const plan: EntityPlan[] = [];

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

  const systemPrompt = `You are a research agent building a comprehensive personal encyclopedia (like Wikipedia) about a specific person. Your job is to:

1. READ the LinkedIn profile carefully
2. SEARCH the web to discover additional information the profile doesn't mention — company news, acquisitions, publications, talks, open source projects, industry context, notable colleagues
3. SAVE every meaningful piece of information as a source file
4. PLAN the articles that should exist in this encyclopedia

Be thorough. A good encyclopedia about a person should cover not just their career history, but the companies they worked at (their own Wikipedia-style articles), the technologies they use, the places they've lived, their educational institutions, and any notable projects or publications.

For each web search, think about what an encyclopedia editor would want to know:
- What happened to their previous companies? Any acquisitions, funding rounds, notable products?
- Did they publish anything? Speak at conferences? Contribute to open source?
- What's notable about their educational institutions?
- What are the key developments in their technology areas?

Search at least 5-8 times to build a rich picture. Don't just search for the person's name — search for their companies, their projects, their field.

When you've gathered enough sources, plan ALL the articles. Each article should have a rich dataContext that includes information from BOTH the LinkedIn profile AND your web research. The dataContext is the ONLY input the article writer will see.

Call done_planning when you're finished.`;

  const userPrompt = `Here is the LinkedIn profile to research and build an encyclopedia for:\n\n${profileSummary}`;

  const handleTool = async (
    toolName: string,
    input: Record<string, unknown>
  ): Promise<string> => {
    switch (toolName) {
      case "web_search": {
        const query = input.query as string;
        status.currentArticle = `Researching: ${query}`;
        const results = await webSearch(query);

        // Save search results to raw/
        const searchSlug = slugify(query).slice(0, 50);
        const searchDir = path.join(RAW_DIR, "web");
        await fs.mkdir(searchDir, { recursive: true });
        await fs.writeFile(
          path.join(searchDir, `search-${searchSlug}.json`),
          JSON.stringify({ query, results, timestamp: new Date().toISOString() }, null, 2),
          "utf-8"
        );

        return results;
      }

      case "save_source": {
        const source: GatheredSource = {
          slug: input.slug as string,
          title: input.title as string,
          content: input.content as string,
          url: input.url as string | undefined,
          relevantTo: input.relevantTo as string[],
        };
        sources.push(source);

        // Persist to raw/
        const sourceDir = path.join(RAW_DIR, "sources");
        await fs.mkdir(sourceDir, { recursive: true });
        await fs.writeFile(
          path.join(sourceDir, `${slugify(source.slug)}.json`),
          JSON.stringify(source, null, 2),
          "utf-8"
        );

        return `Source saved: ${source.title} (relevant to: ${source.relevantTo.join(", ")})`;
      }

      case "plan_article": {
        const entity: EntityPlan = {
          slug: input.slug as string,
          title: input.title as string,
          type: input.type as PageType,
          dataContext: input.dataContext as string,
        };
        plan.push(entity);
        status.currentArticle = `Planned: ${entity.title}`;
        return `Article planned: ${entity.title} (${entity.type}) at ${entity.slug}`;
      }

      case "done_planning": {
        return `Planning complete. ${plan.length} articles planned.`;
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  };

  await runAgent(systemPrompt, userPrompt, RESEARCH_TOOLS, handleTool, 30);

  // If agent didn't plan anything (error or confused), fall back to basic plan
  if (plan.length === 0) {
    return { plan: fallbackPlan(profile), sources };
  }

  return { plan, sources };
}

// Fallback if the agent fails — basic mechanical extraction
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
        dataContext: JSON.stringify({ company: pos.company, role: pos.title, dates: `${pos.startDate} - ${pos.endDate || "present"}` }),
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
        dataContext: JSON.stringify({ school: edu.school, degree: edu.degree, field: edu.field }),
      });
    }
  }

  for (const skill of profile.skills.slice(0, 10)) {
    const slug = `technology/${slugify(skill)}`;
    if (!seen.has(slug)) {
      seen.add(slug);
      entities.push({ slug, title: skill, type: "technology", dataContext: JSON.stringify({ skill }) });
    }
  }

  if (profile.location) {
    const slug = `places/${slugify(profile.location)}`;
    if (!seen.has(slug)) {
      entities.push({ slug, title: profile.location, type: "place", dataContext: JSON.stringify({ location: profile.location }) });
    }
  }

  entities.push({
    slug: "career/timeline",
    title: `${profile.name} — Career Timeline`,
    type: "career",
    dataContext: JSON.stringify({ positions: profile.positions, education: profile.education }),
  });

  return entities;
}

// ---------------------------------------------------------------------------
// PHASE 2: Compilation — LLM reads all sources and generates articles
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

  // List all other articles for cross-linking
  const otherArticles = allEntities
    .filter((e) => e.slug !== entity.slug)
    .map((e) => `[[${e.title}]]`)
    .join(", ");

  return `You are writing a Wikipedia-style encyclopedia article about "${entity.title}" (type: ${entity.type}).

## Research context (from web search and LinkedIn profile)
${entity.dataContext}

## Other articles in this encyclopedia (use [[wikilinks]] to cross-reference)
${otherArticles}

## Instructions
1. Write in a neutral, encyclopedic Wikipedia tone.
2. Begin with a bold opening sentence: **${entity.title}** is...
3. Include these sections (use ## headings): ${sections.join(", ")}
4. Use [[wikilinks]] liberally to cross-reference other articles in this encyclopedia.
5. Use [1], [2], etc. footnote citations. Cite the actual sources from the research context.
6. Article length: 200-500 words of body content.
7. Ground the article in the RESEARCH CONTEXT above. Do not invent facts that aren't supported by the context.

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
// Main Page + Index generation (unchanged)
// ---------------------------------------------------------------------------

export async function generateMainPageData(
  profile: LinkedInProfile,
  plan: EntityPlan[]
): Promise<void> {
  const firstName = profile.name.split(" ")[0];
  const encyclopediaName = `${firstName}opedia`;

  const factsPrompt = `Based on this person's profile and the planned encyclopedia articles, generate 5 interesting "Did you know..." facts.

Person: ${profile.name}
Headline: ${profile.headline}
Companies: ${profile.positions.map((p) => p.company).join(", ")}
Education: ${profile.education.map((e) => e.school).join(", ")}

Available articles for linking:
${plan.map((e) => `- ${e.slug} (${e.title})`).join("\n")}

Return a JSON array: [{"fact": "...that [[Person]] did X at [[Company]]?", "relatedArticles": ["slug1"]}]
Make facts specific, surprising, and use [[wikilinks]].`;

  const didYouKnow = await generateJSON<DidYouKnow[]>(factsPrompt);

  const featuredSlug = plan.find((e) => e.type === "person")?.slug ?? plan[0].slug;
  const featuredSummary = await generateText(
    `Write a 2-3 sentence encyclopedia summary of ${profile.name}. ${profile.headline}. ${profile.summary?.slice(0, 300) || ""}`
  );

  const portalCounts: Record<string, { count: number; slug: string }> = {};
  for (const e of plan) {
    const name =
      e.type === "person" ? "People" :
      e.type === "company" ? "Companies" :
      e.type === "education" ? "Education" :
      e.type === "technology" ? "Technology" :
      e.type === "place" ? "Places" :
      e.type === "event" ? "Events" :
      e.type === "project" ? "Projects" :
      e.type === "publication" ? "Publications" : "Career";
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
// MAIN PIPELINE: Two-phase Karpathy-aligned generation
// ---------------------------------------------------------------------------

export async function generateEncyclopedia(
  profile: LinkedInProfile
): Promise<void> {
  try {
    // ================================================================
    // PHASE 1: Agentic source gathering + article planning
    // The LLM agent researches the person, searches the web,
    // saves sources, and plans which articles to create.
    // ================================================================
    status = {
      phase: "fetching",
      totalArticles: 0,
      completedArticles: 0,
      currentArticle: "Researching — the agent is searching the web and planning articles...",
    };

    const { plan, sources } = await gatherSourcesAndPlan(profile);

    // ================================================================
    // PHASE 2: Compilation — generate articles from gathered sources
    // Each article is written with the full research context, not
    // just the LinkedIn profile data.
    // ================================================================
    status = {
      phase: "generating",
      totalArticles: plan.length,
      completedArticles: 0,
      currentArticle: "",
    };

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
    // PHASE 3: Finalize — main page data + index
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
