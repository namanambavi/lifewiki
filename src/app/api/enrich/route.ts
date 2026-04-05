import { NextRequest, NextResponse } from "next/server";
import { listArticles, readArticle, writeArticle } from "@/lib/wiki-io";
import { generateText, generateJSON } from "@/lib/llm";
import fs from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, url, content } = body;

    let sourceText = "";
    const rawDir = path.join(process.cwd(), "data/raw/web");
    await fs.mkdir(rawDir, { recursive: true });

    if (type === "web" && url) {
      const res = await fetch(url);
      sourceText = await res.text();
      sourceText = sourceText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 10000);
      const slug = url.replace(/[^a-z0-9]/gi, "-").slice(0, 50);
      await fs.writeFile(path.join(rawDir, `${slug}.json`), JSON.stringify({ url, text: sourceText }), "utf-8");
    } else if (content) {
      sourceText = content.slice(0, 10000);
    }

    if (!sourceText) return NextResponse.json({ error: "No content to process" }, { status: 400 });

    const articles = await listArticles();
    const indexSummary = articles.map(a => `- ${a.title} (${a.slug}): ${a.summary}`).join("\n");

    const updates = await generateJSON<{ slug: string; updateInstructions: string }[]>(
      `Given this new source and existing encyclopedia index, which articles need updating?\n\nNew source: ${sourceText.slice(0, 3000)}\n\nExisting articles:\n${indexSummary}\n\nReturn JSON array: [{ "slug": "existing/slug", "updateInstructions": "what to add or change" }]\nOnly include articles that genuinely need updating.`
    );

    let updatedCount = 0;
    for (const update of (Array.isArray(updates) ? updates : [])) {
      try {
        const article = await readArticle(update.slug);
        const updatedContent = await generateText(
          `Update this Wikipedia article based on new information.\n\nCurrent article:\n${article.content}\n\nUpdate instructions: ${update.updateInstructions}\n\nReturn the complete updated article content in markdown. Keep the same style. Add new info naturally.`
        );
        article.content = updatedContent;
        article.frontmatter.last_updated = new Date().toISOString();
        await writeArticle(article);
        updatedCount++;
      } catch {}
    }

    return NextResponse.json({ updated: updatedCount, total: updates?.length || 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
