#!/usr/bin/env npx tsx
/**
 * Generation worker — runs as a separate process from the Next.js server.
 * Spawned by /api/generate, uses the Agent SDK for web research,
 * writes results to data/users/{personSlug}/ and status to generation-status.json.
 *
 * Usage: npx tsx scripts/generate-worker.ts <personSlug> <profilePath>
 */

import fs from "fs/promises";
import path from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import Anthropic from "@anthropic-ai/sdk";
import type {
  LinkedInProfile,
  EntityPlan,
  GenerationStatus,
  LogEntry,
  ArticleFrontmatter,
} from "../src/lib/types";
import {
  slugify,
  planFromResearch,
  buildArticlePrompt,
  parseGeneratedArticle,
  generateMainPageData,
  generateIndex,
} from "../src/lib/wiki-engine";
import { writeArticle, getWikiDir, getRawDir } from "../src/lib/wiki-io";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const personSlug = process.argv[2];
const profilePath = process.argv[3];

if (!personSlug || !profilePath) {
  console.error("Usage: npx tsx scripts/generate-worker.ts <personSlug> <profilePath>");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const USERS_DIR = path.join(process.cwd(), "data/users");
const PERSON_DIR = path.join(USERS_DIR, personSlug);
const STATUS_FILE = path.join(PERSON_DIR, "generation-status.json");

// ---------------------------------------------------------------------------
// LLM helpers (direct Anthropic SDK)
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

// ---------------------------------------------------------------------------
// Status + Logging
// ---------------------------------------------------------------------------

const statusLog: LogEntry[] = [];

function logEntry(message: string, type: LogEntry["type"]): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    message,
    type,
  };
  statusLog.push(entry);
  console.log(`[worker] [${type}] ${message}`);
}

async function updateStatus(status: GenerationStatus): Promise<void> {
  status.log = [...statusLog];
  await fs.mkdir(PERSON_DIR, { recursive: true });
  await fs.writeFile(STATUS_FILE, JSON.stringify(status), "utf-8");
}

// ---------------------------------------------------------------------------
// PHASE 1: Research via Agent SDK with timeout
// ---------------------------------------------------------------------------

async function researchWithTimeout(prompt: string, timeoutMs = 90000): Promise<string> {
  let researchReport = "";
  // Keep the LONGEST text block seen — the final assistant message before
  // result typically contains the complete research report
  let longestAssistantText = "";

  const researchPromise = (async () => {
    for await (const message of query({
      prompt,
      options: { allowedTools: ["WebSearch", "WebFetch"], maxTurns: 10 },
    })) {
      const msg = message as Record<string, unknown>;

      // Capture the final result (best case — clean termination)
      if (msg.type === "result" && typeof msg.result === "string") {
        researchReport = msg.result;
        return researchReport;
      }

      // Capture text from every assistant message. The research report
      // accumulates across turns — keep the longest text block as it's
      // most likely the final compiled report.
      if (msg.type === "assistant" && msg.message) {
        const assistantMsg = msg.message as Record<string, unknown>;
        if (Array.isArray(assistantMsg.content)) {
          for (const block of assistantMsg.content) {
            const b = block as Record<string, unknown>;
            if (b.type === "text" && typeof b.text === "string") {
              if (b.text.length > longestAssistantText.length) {
                longestAssistantText = b.text;
              }
              logEntry(
                `Research in progress (${b.text.length} chars collected)...`,
                "research"
              );
              void updateStatus({
                phase: "fetching",
                totalArticles: 0,
                completedArticles: 0,
                currentArticle: `Researching... ${b.text.length} chars collected`,
              });
            }
          }
        }
      }
    }
    // Loop ended without result message — use longest assistant text
    return researchReport || longestAssistantText;
  })();

  const timeoutPromise = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error("Research timed out")), timeoutMs)
  );

  try {
    return await Promise.race([researchPromise, timeoutPromise]);
  } catch {
    // Timeout hit — use whatever was collected
    const collected = researchReport || longestAssistantText;
    if (collected.length > 0) {
      logEntry(
        `Research timed out but collected ${collected.length} chars. Proceeding with partial results.`,
        "info"
      );
      return collected;
    }
    throw new Error("Research timed out with no results");
  }
}

async function researchPerson(profile: LinkedInProfile): Promise<string> {
  // Break research into focused, fast queries (each <60s) instead of
  // one massive prompt that hangs. Proven: focused queries with maxTurns:10
  // complete in ~30-40 seconds reliably.

  const queries = [
    {
      label: "person",
      prompt: `Search the web for "${profile.name}" and find: what companies they work at, what they've built, their background, any notable achievements. Give a detailed summary with specific facts, dates, and numbers.`,
    },
  ];

  // Add company-specific queries if we know their companies
  const companies = profile.positions.map((p) => p.company).filter(Boolean);
  if (companies.length > 0) {
    queries.push({
      label: "companies",
      prompt: `Search the web for these companies and give key facts about each (what they do, funding, size, notable products): ${companies.join(", ")}. Be specific with numbers and dates.`,
    });
  }

  // Run queries in parallel for speed
  logEntry(`Running ${queries.length} research queries in parallel...`, "research");

  const results = await Promise.all(
    queries.map(async (q) => {
      logEntry(`Researching: ${q.label}...`, "research");
      try {
        const text = await researchWithTimeout(q.prompt, 90000); // 90s per query
        logEntry(`${q.label}: found ${text.length} chars`, "research");
        return `## ${q.label.charAt(0).toUpperCase() + q.label.slice(1)} Research\n\n${text}`;
      } catch (err) {
        logEntry(`${q.label}: ${err instanceof Error ? err.message : "failed"}`, "error");
        return "";
      }
    })
  );

  const researchReport = results.filter(Boolean).join("\n\n---\n\n");

  // Save research
  const rawDir = getRawDir(personSlug);
  const researchDir = path.join(rawDir, "research");
  await fs.mkdir(researchDir, { recursive: true });
  await fs.writeFile(
    path.join(researchDir, `${slugify(profile.name)}-research.md`),
    researchReport,
    "utf-8"
  );

  return researchReport;
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  const profileData = JSON.parse(await fs.readFile(profilePath, "utf-8"));
  const profile = profileData as LinkedInProfile;

  console.log(`[worker] Starting encyclopedia generation for ${profile.name} (slug: ${personSlug})`);

  try {
    // Phase 1: Research
    logEntry(`Searching the web for ${profile.name}...`, "research");
    await updateStatus({ phase: "fetching", totalArticles: 0, completedArticles: 0, currentArticle: "Researching via web search..." });
    const research = await researchPerson(profile);
    logEntry(`Research complete: found ${research.length} chars of information`, "research");

    // Phase 1.5: Plan
    logEntry(`Planning articles...`, "info");
    await updateStatus({ phase: "planning", totalArticles: 0, completedArticles: 0, currentArticle: "Planning articles..." });
    const plan = await planFromResearch(profile, research);
    logEntry(`Planning ${plan.length} articles...`, "info");

    // Phase 2a: Generate the PERSON article first (fast path to visible wiki)
    const wikiDir = getWikiDir(personSlug);
    await fs.mkdir(wikiDir, { recursive: true });

    const personEntity = plan.find((e) => e.type === "person") || plan[0];
    const systemPrompt = "You are a Wikipedia article writer. Write in a neutral, encyclopedic tone. Return raw Markdown with YAML frontmatter — no code fences.";

    logEntry(`Generating main article: ${personEntity.title}`, "article");
    await updateStatus({ phase: "generating", totalArticles: plan.length, completedArticles: 0, currentArticle: personEntity.title });

    const personText = await generateText(buildArticlePrompt(personEntity, profile, plan), systemPrompt);
    const personArticle = parseGeneratedArticle(personText, personEntity);
    await writeArticle(personArticle, wikiDir);
    logEntry(`Generated: ${personEntity.title}`, "article");

    // Generate main page + index immediately so the UI can render
    await generateMainPageData(profile, plan, personSlug);
    await generateIndex(plan, personSlug);

    // Mark as "ready" — the UI redirects now, remaining articles generate in background
    logEntry(`Wiki is live! Generating ${plan.length - 1} more articles...`, "info");
    await updateStatus({ phase: "generating", totalArticles: plan.length, completedArticles: 1, currentArticle: "Wiki is live — generating remaining articles..." });

    // Phase 2b: Generate remaining articles in parallel batches
    const remainingPlan = plan.filter((e) => e.slug !== personEntity.slug);
    const BATCH_SIZE = 10;
    let completed = 1;

    for (let i = 0; i < remainingPlan.length; i += BATCH_SIZE) {
      const batch = remainingPlan.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (entity) => {
          const text = await generateText(buildArticlePrompt(entity, profile, plan), systemPrompt);
          return { entity, text };
        })
      );

      for (const { entity, text } of results) {
        const article = parseGeneratedArticle(text, entity);
        await writeArticle(article, wikiDir);
        completed++;
        logEntry(`Generated: ${entity.title}`, "article");
        await updateStatus({ phase: "generating", totalArticles: plan.length, completedArticles: completed, currentArticle: entity.title });
      }

      // Re-generate index after each batch so new articles are immediately navigable
      await generateIndex(plan.filter((_, idx) => idx < i + BATCH_SIZE + 1 || plan[idx] === personEntity), personSlug);
    }

    // Final index with all articles
    await generateIndex(plan, personSlug);

    // Done
    logEntry(`Encyclopedia complete! ${plan.length} articles`, "info");
    await updateStatus({ phase: "complete", totalArticles: plan.length, completedArticles: plan.length, currentArticle: "" });
    console.log(`[worker] Done! ${plan.length} articles generated.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[worker] Error:", message);
    logEntry(message, "error");
    await updateStatus({ phase: "error", totalArticles: 0, completedArticles: 0, currentArticle: "", error: message });
    process.exit(1);
  }
}

main();
