import Infobox from "./Infobox";
import TableOfContents, { extractHeadings, addHeadingIds } from "./TableOfContents";
import type { Article } from "@/lib/types";

interface Props {
  article: Article;
  personSlug: string;
}

export default function ArticlePage({ article, personSlug }: Props) {
  const htmlWithIds = addHeadingIds(article.html || "");
  const headings = extractHeadings(htmlWithIds);

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
    </div>
  );
}
