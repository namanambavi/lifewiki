import Link from "next/link";
import { listArticles, getWikiDir } from "@/lib/wiki-io";

interface SearchPageProps {
  params: Promise<{ person: string }>;
  searchParams: Promise<{ q?: string }>;
}

export default async function PersonSearchPage({ params, searchParams }: SearchPageProps) {
  const { person } = await params;
  const { q } = await searchParams;
  const query = q?.toLowerCase() ?? "";
  const wikiDir = getWikiDir(person);

  const allArticles = await listArticles(wikiDir).catch(() => []);

  const results = query
    ? allArticles.filter(a =>
        a.title.toLowerCase().includes(query) ||
        a.summary.toLowerCase().includes(query) ||
        a.categories.some(c => c.toLowerCase().includes(query))
      )
    : allArticles;

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "16px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "20px", marginBottom: "8px" }}>
        {query ? `Search results for "${q}"` : "All Articles"}
      </h1>
      <p style={{ fontSize: "13px", color: "#54595d", marginBottom: "16px" }}>
        {results.length} article{results.length !== 1 ? "s" : ""} found
      </p>

      {results.length === 0 ? (
        <p style={{ fontSize: "14px", color: "#54595d" }}>No articles match your search.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {results.map(article => (
            <li key={article.slug} style={{ borderBottom: "1px solid #eaecf0", padding: "12px 0" }}>
              <Link
                href={`/${person}/wiki/${article.slug}`}
                style={{ fontSize: "16px", color: "#3366cc", textDecoration: "none", fontWeight: "bold" }}
              >
                {article.title}
              </Link>
              <p style={{ fontSize: "13px", color: "#202122", margin: "4px 0 0" }}>{article.summary}</p>
              {article.categories.length > 0 && (
                <p style={{ fontSize: "12px", color: "#54595d", margin: "4px 0 0" }}>
                  Categories: {article.categories.join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
