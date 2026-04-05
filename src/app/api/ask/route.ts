import { NextRequest, NextResponse } from "next/server";
import { listArticles, readArticle, getWikiDir } from "@/lib/wiki-io";
import { generateText } from "@/lib/llm";

export async function POST(request: NextRequest) {
  try {
    const { question, person } = await request.json();
    if (!question) return NextResponse.json({ error: "Question is required" }, { status: 400 });

    const wikiDir = person ? getWikiDir(person) : undefined;
    const articles = await listArticles(wikiDir);
    const relevantSlugs = articles
      .filter(a => question.toLowerCase().includes(a.title.toLowerCase()) || a.categories.some(c => question.toLowerCase().includes(c.toLowerCase())))
      .slice(0, 5)
      .map(a => a.slug);

    if (relevantSlugs.length === 0) relevantSlugs.push(...articles.slice(0, 3).map(a => a.slug));

    const contexts: string[] = [];
    for (const slug of relevantSlugs) {
      try {
        const article = await readArticle(slug, wikiDir);
        contexts.push(`## ${article.frontmatter.title}\n${article.content}`);
      } catch { /* skip */ }
    }

    const prompt = `Based on the following encyclopedia articles, answer this question: "${question}"\n\n${contexts.join("\n\n---\n\n")}\n\nRequirements:\n- Answer concisely using information from the articles\n- Use [[wikilinks]] when referencing articles\n- Cite articles by name\n- If the information isn't in the articles, say so`;

    const answer = await generateText(prompt);
    return NextResponse.json({ answer, sourceSlugs: relevantSlugs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
