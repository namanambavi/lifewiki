import { NextRequest, NextResponse } from "next/server";
import { listArticles, getWikiDir } from "@/lib/wiki-io";

export async function GET(request: NextRequest) {
  try {
    const person = request.nextUrl.searchParams.get("person");
    const wikiDir = person ? getWikiDir(person) : undefined;
    const articles = await listArticles(wikiDir);
    const query = request.nextUrl.searchParams.get("q")?.toLowerCase();
    if (query) {
      const filtered = articles.filter(a =>
        a.title.toLowerCase().includes(query) ||
        a.summary.toLowerCase().includes(query) ||
        a.categories.some(c => c.toLowerCase().includes(query))
      );
      return NextResponse.json(filtered);
    }
    return NextResponse.json(articles);
  } catch {
    return NextResponse.json([]);
  }
}
