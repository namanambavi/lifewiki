import Infobox from "./Infobox";
import TableOfContents, { extractHeadings, addHeadingIds } from "./TableOfContents";
import type { Article, ArticleIndex } from "@/lib/types";

interface Props {
  article: Article;
  personSlug: string;
  allArticles?: ArticleIndex[];
}

export default function ArticlePage({ article, personSlug, allArticles = [] }: Props) {
  const htmlWithIds = addHeadingIds(article.html || "");
  const headings = extractHeadings(htmlWithIds);

  // Find related articles from frontmatter + same category
  const relatedSlugs = new Set(article.frontmatter.related || []);
  const relatedArticles = allArticles.filter(
    (a) => a.slug !== article.slug && (
      relatedSlugs.has(a.slug) ||
      a.categories.some((c) => article.frontmatter.categories.includes(c))
    )
  ).slice(0, 8);

  // Group all articles by type for sidebar navigation
  const articlesByType: Record<string, ArticleIndex[]> = {};
  for (const a of allArticles) {
    if (!articlesByType[a.type]) articlesByType[a.type] = [];
    articlesByType[a.type].push(a);
  }

  return (
    <div className="wiki-body">
      <div className="wiki-content">
        <h1 className="wiki-title">{article.frontmatter.title}</h1>

        {article.frontmatter.infobox && Object.keys(article.frontmatter.infobox).length > 0 && (
          <Infobox title={article.frontmatter.title} infobox={article.frontmatter.infobox} />
        )}

        <TableOfContents headings={headings} />

        <div dangerouslySetInnerHTML={{ __html: htmlWithIds }} />

        {article.frontmatter.categories.length > 0 && (
          <div className="categories">
            <span>Categories: </span>
            {article.frontmatter.categories.map((cat, i) => (
              <span key={cat}>
                <a href={`/${personSlug}/search?q=${encodeURIComponent(cat)}`}>{cat}</a>
                {i < article.frontmatter.categories.length - 1 && " · "}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Wikipedia-style sidebar */}
      <div className="wiki-sidebar">
        {relatedArticles.length > 0 && (
          <div className="sidebar-box">
            <div className="sidebar-box-header">Related articles</div>
            <div className="sidebar-box-content">
              {relatedArticles.map((a) => (
                <a key={a.slug} href={`/${personSlug}/wiki/${a.slug}`}>
                  {a.title}
                </a>
              ))}
            </div>
          </div>
        )}

        {Object.entries(articlesByType).map(([type, articles]) => (
          <div key={type} className="sidebar-box">
            <div className="sidebar-box-header">
              {type.charAt(0).toUpperCase() + type.slice(1)} ({articles.length})
            </div>
            <div className="sidebar-box-content">
              {articles.slice(0, 6).map((a) => (
                <a key={a.slug} href={`/${personSlug}/wiki/${a.slug}`}>
                  {a.title}
                </a>
              ))}
              {articles.length > 6 && (
                <a href={`/${personSlug}/articles`} style={{ fontStyle: "italic", fontSize: "11px" }}>
                  View all {articles.length}...
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
