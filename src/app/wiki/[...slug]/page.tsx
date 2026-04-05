import { readArticle, getAllSlugs } from "@/lib/wiki-io";
import { renderMarkdown } from "@/lib/markdown";
import ArticlePage from "@/components/ArticlePage";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ slug: string[] }>;
}

export default async function WikiArticle({ params }: Props) {
  const { slug } = await params;
  const slugPath = slug.join("/");

  try {
    const article = await readArticle(slugPath);
    const allSlugs = await getAllSlugs();
    article.html = await renderMarkdown(article.content, allSlugs);
    return <ArticlePage article={article} />;
  } catch {
    notFound();
  }
}
