# MyLife.wiki

**Paste a name. Get their entire Wikipedia.**

MyLife.wiki generates a full, interlinked personal encyclopedia for anyone. Type a name, and an AI research agent searches the web, discovers everything about that person, then compiles 40-50+ Wikipedia-style articles covering their companies, schools, skills, locations, career milestones, and notable connections.

Every article has an infobox, table of contents, wikilinks to other articles, footnote citations, and categories -- just like Wikipedia.

## How it works

1. **Research** -- A Claude Agent SDK agent searches the web for the person (WebSearch + WebFetch)
2. **Plan** -- The LLM analyzes research findings and plans 40-80 articles
3. **Generate** -- Articles are generated in parallel batches with full Wikipedia formatting
4. **Render** -- A Next.js app serves the encyclopedia with Wikipedia's Vector skin CSS

The entire pipeline takes ~3 minutes per person.

## Architecture

Follows the [LLM Wiki pattern](https://x.com/kaboroo/status/...) by Andrej Karpathy:

```
[Name + LinkedIn URL]
    |
[Claude Agent SDK -- WebSearch + WebFetch]
    | research saved to data/users/{slug}/raw/
[LLM plans articles from research]
    |
[LLM generates Wikipedia articles in parallel]
    | markdown saved to data/users/{slug}/wiki/
[Next.js renders as Wikipedia]
```

Three layers:
- **Raw sources** (`data/users/{slug}/raw/`) -- immutable research data
- **Wiki** (`data/users/{slug}/wiki/`) -- LLM-generated markdown articles
- **Rendering** -- Next.js with Wikipedia Vector skin CSS

## Quick start

```bash
git clone https://github.com/namanambavi/mylife-wiki.git
cd wikipeople
npm install
cp .env.local.example .env.local
# Add your Anthropic API key to .env.local
npm run dev
```

Open http://localhost:3000, type a name, and wait ~3 minutes.

## Requirements

- Node.js 18+
- Anthropic API key ([get one here](https://console.anthropic.com))
- ~$0.30 per encyclopedia in API costs

## Tech stack

- **Next.js 15** -- App Router, server components
- **Claude Agent SDK** -- agentic web research with WebSearch + WebFetch
- **Anthropic SDK** -- article generation (Claude Sonnet 4.6)
- **Wikipedia Vector skin** -- faithful CSS clone for the UI
- **remark/rehype** -- markdown to HTML with wikilink resolution
- **TypeScript** throughout

## Rate limiting

Built-in rate limiting: 2 generations per IP per hour. For production deployment, replace the in-memory store with Redis.

## Multi-person

Each person gets their own isolated encyclopedia at `/{person-slug}/`. Generate as many as you want -- each lives in `data/users/{slug}/`.

## License

MIT
