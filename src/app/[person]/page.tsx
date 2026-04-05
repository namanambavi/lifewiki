import fs from "fs";
import path from "path";
import MainPage from "@/components/MainPage";
import { notFound } from "next/navigation";
import { renderMarkdown } from "@/lib/markdown";
import { getAllSlugs, getWikiDir } from "@/lib/wiki-io";
import type { MainPageData } from "@/lib/types";

interface Props {
  params: Promise<{ person: string }>;
}

export default async function PersonMainPage({ params }: Props) {
  const { person } = await params;
  const mainPagePath = path.join(process.cwd(), "data/users", person, "wiki", "main-page.json");

  try {
    if (!fs.existsSync(mainPagePath)) {
      notFound();
    }
    const raw = fs.readFileSync(mainPagePath, "utf-8");
    const data: MainPageData = JSON.parse(raw);

    // Render markdown + wikilinks in the featured summary and "Did you know" facts
    const wikiDir = getWikiDir(person);
    let allSlugs: string[] = [];
    try { allSlugs = await getAllSlugs(wikiDir); } catch { /* empty wiki */ }

    // Process featured article summary (contains **bold** and [[wikilinks]])
    data.featuredArticleSummary = await renderMarkdown(
      data.featuredArticleSummary,
      allSlugs,
      person
    );

    // Process each "Did you know" fact
    for (let i = 0; i < data.didYouKnow.length; i++) {
      data.didYouKnow[i].fact = await renderMarkdown(
        data.didYouKnow[i].fact,
        allSlugs,
        person
      );
    }

    return <MainPage data={data} personSlug={person} />;
  } catch {
    notFound();
  }
}
