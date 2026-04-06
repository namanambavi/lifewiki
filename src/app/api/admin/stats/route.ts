import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  const adminKey = process.env.ADMIN_KEY;

  if (!adminKey || key !== adminKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
  const usersDir = path.join(DATA_DIR, "users");

  try {
    const people = await fs.readdir(usersDir);
    const stats = [];

    for (const slug of people) {
      const personDir = path.join(usersDir, slug);
      const stat = await fs.stat(personDir);
      if (!stat.isDirectory()) continue;

      let articles = 0;
      let name = slug;

      try {
        const mainPage = JSON.parse(
          await fs.readFile(path.join(personDir, "wiki", "main-page.json"), "utf-8")
        );
        name = mainPage.personName || slug;
        articles = mainPage.totalArticles || 0;
      } catch { /* no main page yet */ }

      stats.push({
        slug,
        name,
        articles,
        created: stat.birthtime.toISOString(),
      });
    }

    return NextResponse.json({
      total: stats.length,
      encyclopedias: stats,
    });
  } catch {
    return NextResponse.json({ total: 0, encyclopedias: [] });
  }
}
