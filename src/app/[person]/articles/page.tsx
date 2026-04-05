import Link from "next/link";
import { listArticles, getWikiDir } from "@/lib/wiki-io";

interface Props {
  params: Promise<{ person: string }>;
}

export default async function PersonArticlesPage({ params }: Props) {
  const { person } = await params;
  const wikiDir = getWikiDir(person);

  const articles = await listArticles(wikiDir).catch(() => []);

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "16px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "20px", marginBottom: "8px" }}>All Articles</h1>
      <p style={{ fontSize: "13px", color: "#54595d", marginBottom: "16px" }}>
        {articles.length} article{articles.length !== 1 ? "s" : ""} in this encyclopedia
      </p>

      {articles.length === 0 ? (
        <p style={{ fontSize: "14px", color: "#54595d" }}>No articles generated yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {articles.map(article => (
            <li key={article.slug} style={{ borderBottom: "1px solid #eaecf0", padding: "12px 0" }}>
              <Link
                href={`/${person}/wiki/${article.slug}`}
                style={{ fontSize: "16px", color: "#3366cc", textDecoration: "none", fontWeight: "bold" }}
              >
                {article.title}
              </Link>
              <p style={{ fontSize: "13px", color: "#202122", margin: "4px 0 0" }}>{article.summary}</p>
              <p style={{ fontSize: "12px", color: "#54595d", margin: "4px 0 0" }}>
                Type: {article.type}
                {article.categories.length > 0 && ` | Categories: ${article.categories.join(", ")}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
