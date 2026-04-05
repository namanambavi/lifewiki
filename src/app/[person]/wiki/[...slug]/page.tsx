import { readArticle, getAllSlugs, getWikiDir, listArticles } from "@/lib/wiki-io";
import { renderMarkdown } from "@/lib/markdown";
import ArticlePage from "@/components/ArticlePage";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ person: string; slug: string[] }>;
}

export default async function WikiArticle({ params }: Props) {
  const { person, slug } = await params;
  const slugPath = slug.join("/");
  const wikiDir = getWikiDir(person);

  try {
    const article = await readArticle(slugPath, wikiDir);
    const allSlugs = await getAllSlugs(wikiDir);
    article.html = await renderMarkdown(article.content, allSlugs, person);

    // Get all articles for sidebar navigation
    let allArticles: Awaited<ReturnType<typeof listArticles>> = [];
    try { allArticles = await listArticles(wikiDir); } catch { /* empty */ }

    return <ArticlePage article={article} personSlug={person} allArticles={allArticles} />;
  } catch {
    notFound();
  }
}
