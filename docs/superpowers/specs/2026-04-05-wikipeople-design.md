# WikiPeople — Your Own Wikipedia, Generated from LinkedIn

## Overview

Paste a LinkedIn URL. Get an entire personal encyclopedia.

WikiPeople takes a LinkedIn profile URL, fetches the profile data via API, and uses an LLM to generate a full Wikipedia-style encyclopedia centered on that person. Not one page — an entire self-contained wiki with 30-50+ interlinked articles covering every company, school, skill, location, and person in their professional universe.

The UI is a faithful clone of Wikipedia's Vector skin. The Main Page mirrors wikipedia.org/wiki/Main_Page with colored section boxes, "Did you know..." facts, portals, and a featured article. Every article page has an infobox, table of contents, section headers, blue wikilinks, footnote citations, and categories.

Each person's encyclopedia is named after them: "Namanopedia", "Janeopedia", etc.

## Architecture

Three layers, following the LLM Wiki pattern:

### 1. Raw Sources (`/data/raw/`)

Immutable source data. The LLM reads from these but never modifies them.

- `linkedin/profile.json` — full LinkedIn profile from API
- `web/[slug].json` — scraped web pages (future enrichment)
- `uploads/[filename]` — user-uploaded documents (future enrichment)

### 2. Wiki (`/data/wiki/`)

LLM-generated markdown files. One file per article. The LLM owns this layer entirely — creates, updates, and maintains all files.

Structure:
```
data/wiki/
  index.md              # catalog of all articles with summaries and categories
  log.md                # chronological record of ingests and updates
  people/
    naman-ambavi.md     # main person article
    jane-smith.md       # connection
    bob-chen.md         # connection
  companies/
    acme-corp.md
    google.md
    startupxyz.md
  education/
    stanford-university.md
  technology/
    python.md
    machine-learning.md
    pytorch.md
    react.md
  places/
    san-francisco.md
  career/
    timeline.md
```

Each markdown file uses YAML frontmatter for structured data:

```yaml
---
title: "Acme Corp"
type: company
categories: ["Companies", "AI startups", "San Francisco"]
related: ["Naman Ambavi", "Jane Smith", "Machine Learning"]
infobox:
  industry: "Artificial Intelligence"
  founded: "2022"
  headquarters: "San Francisco, CA"
  key_people: ["Jane Smith (CTO)", "Naman Ambavi (Sr. ML Engineer)"]
sources: ["linkedin/profile.json"]
last_updated: "2026-04-05T09:30:00Z"
---

**Acme Corp** is an artificial intelligence company based in [[San Francisco]]...
```

Wikilinks use `[[Page Title]]` syntax. The renderer resolves these to internal routes.

### 3. Schema (`/data/schema.json`)

Configuration that tells the LLM how to generate pages:

```json
{
  "page_types": {
    "person": {
      "sections": ["Early life and education", "Career", "Skills and expertise", "Notable connections"],
      "infobox_fields": ["born", "education", "occupation", "employer", "known_for", "skills"]
    },
    "company": {
      "sections": ["History", "Products and services", "Key people", "Related entities"],
      "infobox_fields": ["industry", "founded", "headquarters", "key_people"]
    },
    "education": {
      "sections": ["Overview", "Notable programs", "Notable alumni"],
      "infobox_fields": ["type", "location", "founded", "notable_programs"]
    },
    "technology": {
      "sections": ["Overview", "Usage", "Related technologies"],
      "infobox_fields": ["paradigm", "first_appeared", "used_by"]
    },
    "place": {
      "sections": ["Overview", "Economy", "Notable companies", "Notable people"],
      "infobox_fields": ["country", "state", "population", "known_for"]
    }
  },
  "naming": "lowercase-hyphenated",
  "wikilink_format": "[[Page Title]]",
  "citation_format": "footnote-numbered"
}
```

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **LLM:** Anthropic SDK (`@anthropic-ai/sdk`) — Claude for all page generation, query answering, and lint
- **LinkedIn data:** User's existing LinkedIn profile API (accepts a LinkedIn URL, returns full profile JSON including positions, education, skills, connections, headline, summary, location). The API endpoint and auth details are configured via environment variable `LINKEDIN_API_URL` and `LINKEDIN_API_KEY`
- **Styling:** Wikipedia Vector skin CSS clone + Tailwind for responsive breakpoints
- **Markdown:** `remark` + `rehype` pipeline with custom wikilink resolver plugin
- **Deployment:** Vercel (for shareable URL)
- **Language:** TypeScript throughout

## Data Flow

### Initial Generation (from LinkedIn URL)

```
1. User pastes LinkedIn URL in the UI
2. POST /api/generate { url: "linkedin.com/in/naman" }
3. Server calls LinkedIn API → gets full profile JSON
4. Save to /data/raw/linkedin/profile.json
5. Extract entities: person, companies, schools, skills, locations, connections
6. LLM call: generate index.md (catalog of all planned articles)
7. LLM calls (parallelized): generate each article
   - Main person article
   - One article per company (LLM uses its own knowledge + LinkedIn data)
   - One article per school
   - One article per major skill/technology
   - One article per significant location
   - One article per notable connection (if enough data)
   - Career timeline article
8. LLM call: generate "Did you know..." facts for Main Page
9. Save all markdown files to /data/wiki/
10. Update log.md
11. Return success → UI renders the encyclopedia
```

**Minimum article rules:** Always generate: 1 person article, 1 article per employer, 1 per school, 1 per skill with 3+ endorsements (or top 10 skills), 1 per city lived/worked in, 1 career timeline. For connections: only generate people pages for connections who share a company or school with the subject (avoids generating 300+ thin pages from connection lists).

**Token management:** The entity extraction step creates a structured plan first (what articles to generate, what data goes where). Each article is generated independently with just its relevant data, not the entire profile. This keeps individual LLM calls small (~2-4K tokens each).

**Parallelization:** Company, school, skill, and location articles can be generated in parallel (no dependencies between them). The person article and "Did you know..." facts are generated last (they reference other pages).

### Enrichment (adding sources)

```
1. User clicks "Add source" → pastes URL or uploads file
2. POST /api/enrich { type: "web", url: "..." } or file upload
3. Server scrapes/saves to /data/raw/
4. LLM reads new source + reads existing index.md
5. LLM determines which existing articles need updating
6. LLM updates affected articles (incremental, not regenerate)
7. LLM may create new articles if new entities discovered
8. Update index.md and log.md
```

### Query (Ask the encyclopedia)

```
1. User types question in "Ask this encyclopedia" box
2. POST /api/ask { question: "What connects Naman to TensorFlow?" }
3. Server reads index.md to find relevant articles
4. Server reads the relevant articles (2-5 pages)
5. LLM answers the question with citations to specific articles
6. Return answer with [[wikilinks]] to cited pages
```

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/` | GET | Main Page (Wikipedia homepage) |
| `/wiki/[...slug]` | GET | Article page (e.g. `/wiki/companies/google`) |
| `/api/generate` | POST | Generate encyclopedia from LinkedIn URL |
| `/api/enrich` | POST | Add a source, trigger re-indexing |
| `/api/ask` | POST | Query the encyclopedia |
| `/api/articles` | GET | Return all article metadata (for search, navigation) |
| `/api/status` | GET | Generation progress (for loading state) |

## Page Rendering

Markdown → HTML pipeline:

1. Read markdown file from `/data/wiki/[path].md`
2. Parse YAML frontmatter (title, type, categories, infobox, related)
3. Convert markdown body to HTML via `remark` → `rehype`
4. Custom plugin: resolve `[[wikilinks]]` to `<a href="/wiki/[slug]">` links
5. Custom plugin: convert footnote markers `[1]` to proper `<sup>` references
6. Template: wrap in Wikipedia Vector skin HTML (infobox from frontmatter, TOC auto-generated from headings, categories from frontmatter)

Red links: If a wikilink points to a page that doesn't exist, render it as a red link (`class="new"`) — standard Wikipedia convention for missing articles.

## Wikipedia CSS

Clone the Vector skin with these key elements:
- Site header with logo ("Namanopedia") and search bar
- Tab bar (Main Page, All articles, Sources, Graph)
- Article layout: title, infobox (float right), TOC, section headers with bottom borders
- Blue links (`#36c`), red links for missing pages (`#ba0000`)
- Category bar at article bottom
- Footnote references
- Sidebar on Main Page with colored section headers
- `font-family: 'Linux Libertine', Georgia, 'Times New Roman', serif` for body text
- `font-family: sans-serif` for UI elements (tabs, search, sidebar headers)

Source: MediaWiki Vector skin is open source (GPL). We clone the visual style, not the code.

## Hackathon Scope

### In scope
- LinkedIn URL → full encyclopedia generation (30-50+ articles)
- Wikipedia-faithful Main Page with all sections
- Wikipedia-faithful article pages with infobox, TOC, wikilinks, citations, categories
- Page types: person, company, education, technology, location, career timeline
- "Did you know..." auto-generated facts
- Search across articles
- "Ask this encyclopedia" with cited answers
- "Enrich" — add URL to scrape or upload document, triggers re-index
- Responsive desktop + mobile
- Deploy to Vercel

### Out of scope
- Live source connections (OAuth, Twitter API)
- Graph view visualization
- Multi-user / accounts
- Lint command
- Manual wiki editing
- Privacy infrastructure
- Multiple encyclopedias in one instance

## Latency Budget

Target: encyclopedia generated in under 2 minutes.

| Step | Est. time | Notes |
|------|-----------|-------|
| LinkedIn API call | 2-5s | Single API call |
| Entity extraction | 5-10s | Single LLM call |
| Article generation (30 articles, parallel batches of 5) | 30-60s | ~6 batches of parallel calls |
| "Did you know..." + Main Page data | 10-15s | Single LLM call |
| File writes | 1-2s | Trivial |
| **Total** | **~50-90s** | Under 2 minutes |

## Success Criteria

- Paste a LinkedIn URL, get a full encyclopedia in under 2 minutes
- At least 30 interlinked articles generated
- Every company, school, and skill has its own page with real content
- Wikilinks work — click any blue link, arrive at a real page
- "Ask this encyclopedia" returns a grounded answer with page citations
- Adding one more source visibly enriches existing pages
- Someone seeing the demo says "can I make one for myself?"

## Retention & Open Source Model

### Open source core
- Wikipedia CSS rendering engine
- Markdown → Wikipedia HTML pipeline with wikilink resolution
- LLM page generation prompts and schema
- Ingestion pipeline (entity extraction, article generation, incremental updates)
- Query engine (index-based retrieval + LLM answering)

### Cloud version (covers LLM costs)
- Hosted generation — paste URL, no API key needed
- Continuous enrichment — connect live sources (email, Twitter)
- Scheduled re-indexing — wiki auto-updates as new data arrives
- Multiple encyclopedias per user
- Sharing — make your encyclopedia public or private

### Evolution path
1. **Hackathon:** LinkedIn-seeded, single encyclopedia, local/Vercel
2. **v1:** Cloud hosted, multiple sources, enrichment pipeline
3. **v2:** Live sources, continuous indexing, the full LLM Wiki vision with any domain (not just people)

## File Structure

```
wiki/
  package.json
  next.config.js
  tsconfig.json
  src/
    app/
      page.tsx                    # Main Page (Wikipedia homepage)
      wiki/[...slug]/page.tsx     # Article pages
      layout.tsx                  # Wikipedia shell (header, tabs)
    api/
      generate/route.ts           # LinkedIn → encyclopedia
      enrich/route.ts             # Add source, re-index
      ask/route.ts                # Query the encyclopedia
      articles/route.ts           # List all articles
      status/route.ts             # Generation progress
    lib/
      linkedin.ts                 # LinkedIn API client
      llm.ts                      # Anthropic SDK wrapper
      wiki-engine.ts              # Core: entity extraction, article generation, incremental update
      markdown.ts                 # Markdown → HTML pipeline with wikilink resolution
      schema.ts                   # Page type definitions and generation rules
    components/
      WikiHeader.tsx              # Site header + search
      WikiTabs.tsx                # Navigation tabs
      ArticlePage.tsx             # Article layout (infobox, TOC, content, categories)
      MainPage.tsx                # Homepage layout (featured, did-you-know, portals)
      Infobox.tsx                 # Wikipedia-style infobox from frontmatter
      TableOfContents.tsx         # Auto-generated from headings
      SearchBar.tsx               # Article search
      AskBox.tsx                  # "Ask this encyclopedia" widget
    styles/
      wikipedia.css               # Vector skin clone
      globals.css                 # Tailwind + overrides
  data/
    raw/                          # Immutable source data
    wiki/                         # LLM-generated markdown articles
    schema.json                   # Page generation config
  scripts/
    seed.ts                       # CLI: generate encyclopedia from LinkedIn URL (for local dev)
```
