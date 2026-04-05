export type PageType = "person" | "company" | "education" | "technology" | "place" | "career" | "event" | "project" | "publication";

export interface Infobox {
  [key: string]: string | string[];
}

export interface ArticleFrontmatter {
  title: string;
  type: PageType;
  categories: string[];
  related: string[];
  infobox: Infobox;
  sources: string[];
  last_updated: string;
}

export interface Article {
  slug: string;           // e.g. "companies/google"
  frontmatter: ArticleFrontmatter;
  content: string;        // markdown body (without frontmatter)
  html?: string;          // rendered HTML
}

export interface ArticleIndex {
  slug: string;
  title: string;
  type: PageType;
  summary: string;
  categories: string[];
}

export interface LinkedInProfile {
  name: string;
  headline: string;
  summary: string;
  location: string;
  positions: {
    title: string;
    company: string;
    startDate: string;
    endDate: string | null;
    description: string;
  }[];
  education: {
    school: string;
    degree: string;
    field: string;
    startDate: string;
    endDate: string;
  }[];
  skills: string[];
  connections: {
    name: string;
    headline: string;
    company?: string;
  }[];
}

export interface EntityPlan {
  slug: string;
  title: string;
  type: PageType;
  dataContext: string;    // relevant data snippet for this article
}

export interface LogEntry {
  timestamp: string;
  message: string;
  type: "info" | "research" | "article" | "error";
}

export interface GenerationStatus {
  phase: "fetching" | "planning" | "generating" | "finalizing" | "complete" | "error";
  totalArticles: number;
  completedArticles: number;
  currentArticle: string;
  error?: string;
  log?: LogEntry[];
}

export interface DidYouKnow {
  fact: string;
  relatedArticles: string[]; // slugs
}

export interface MainPageData {
  personName: string;
  encyclopediaName: string;
  totalArticles: number;
  totalSources: number;
  totalCrossReferences: number;
  featuredArticleSummary: string;
  featuredArticleSlug: string;
  didYouKnow: DidYouKnow[];
  portals: { name: string; count: number; slug: string }[];
  recentPeople: { name: string; description: string; slug: string }[];
  careerTimeline: { year: string; event: string; slug: string }[];
}
