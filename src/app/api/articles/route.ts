import { NextRequest, NextResponse } from "next/server";
import { listArticles } from "@/lib/wiki-io";

export async function GET(request: NextRequest) {
  try {
    const articles = await listArticles();
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
