# Podcast Infographic Summarizer

> Turn any podcast episode into a rich, interactive visual summary — AI-generated chapter infographics, a clickable knowledge graph, speaker attribution, and a full markdown export.

Works with **Claude Code** (no API key needed — uses your Claude Pro or Max subscription). Also supports Anthropic API, OpenAI, or any OpenAI-compatible provider.

---

## What you get

For every episode you process, the tool produces a single self-contained HTML file with:

- **Per-chapter SVG infographics** — AI-designed visual layouts (comparisons, causal chains, hub-and-spoke, timelines, etc.) tailored to each chapter's content
- **Interactive D3.js knowledge graph** — 25+ nodes representing the episode's key concepts, cross-linked to chapter sections
- **Episode thesis** — the central argument extracted and explained in one paragraph
- **Speaker attribution** — who said what, with host questions and guest positions tracked per chapter
- **Insight scoring** — novelty, actionability, and specificity rated per chapter
- **In-page Q&A** — ask questions about the episode, answered instantly via client-side TF-IDF (no server needed)
- **Markdown export** — download the full summary as `.md` with one click

---

## Supported podcasts

| Podcast | Example URL |
|---|---|
| **Conversations with Tyler** | `conversationswithtyler.com/episodes/...` |
| **Dwarkesh Podcast** | `dwarkeshpatel.com/...` or `dwarkesh.com/...` |
| **Invest Like the Best** | `joincolossus.com/episodes/...` or `colossus.com/...` |
| **Lex Fridman Podcast** | `lexfridman.com/...-transcript` |
| **Acquired** | `acquired.fm/episodes/...` |
| **TBPN** | `open.spotify.com/episode/...` or `tbpn.com/...` |
| **Cheeky Pint** | `cheekypint.com/episodes/...` |
| **YouTube** | `youtube.com/watch?v=...` or `youtu.be/...` |

---

## Quickstart

### Prerequisites

- **Node.js 18+**
- **Claude Code** installed and logged in with a Claude Pro or Max account:
  ```bash
  npm install -g @anthropic-ai/claude-code
  claude  # log in on first run
  ```

### Setup (one time)

```bash
git clone https://github.com/raamcharran/podcast-summarizer
cd podcast-summarizer
npm install
```

### Run it

```bash
node index.js "https://conversationswithtyler.com/episodes/marc-andreessen/"
```

That's it. The tool uses your active Claude Code session — no API key required. Output is saved to `./output/<episode-slug>.html`. Open it in any browser.

Typical time: **10–30 min** per episode depending on transcript length. All stages are cached — if interrupted, re-running resumes from where it left off.

---

## Using with an API key instead

If you're not on Claude Code, set one of these before running:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...
```

Then run the same command:

```bash
node index.js "https://dwarkeshpatel.com/some-episode/"
```

See [PROVIDERS.md](PROVIDERS.md) for full setup details including OpenAI-compatible endpoints (Groq, Together, Ollama, etc.).

---

## All providers

| Provider | How to activate | Default model |
|---|---|---|
| **Claude Code** (recommended) | Logged-in Claude Code session (Pro or Max) | session default |
| **Anthropic API** | `ANTHROPIC_API_KEY=sk-ant-...` | `claude-sonnet-4-6` |
| **OpenAI** | `OPENAI_API_KEY=sk-...` | `gpt-4o-mini` |
| **OpenAI-compatible** (Groq, Together, Ollama...) | `OPENAI_API_KEY=...` + `OPENAI_BASE_URL=https://...` | `gpt-4o-mini` |

Optional overrides:

```bash
AI_MODEL=claude-opus-4-6    # use a specific model
AI_TIMEOUT_MS=300000        # LLM call timeout in ms (default: 5 min)
```

---

## CLI reference

```
node index.js <episode-url>                   Scrape + analyze + generate HTML
node index.js <episode-url> --no-cache        Full re-run, ignore cached result
node index.js <episode-url> --regen-synthesis Re-run knowledge graph only
node index.js <episode-url> --debug-scrape    Print scraped transcript and exit
node index.js <episode-url> --out ./out       Custom output directory
node index.js <episode-url> --html page.html  Use local HTML instead of fetching
node index.js --json episode.json             Load transcript from JSON file
```

---

## How it works

```
Episode URL
  → Scrape transcript       (site-specific scrapers, Cheerio HTML parsing)
  → Cache check             (SHA256 URL hash → ~/.podcast-summarizer/library/)
  → Detect chapters         (AI: thematic segmentation with anchor quote resolution)
  → Enrich each chapter     (AI: summary, key quote, concepts, insight scores, speakers)
  → Critic loop             (AI: hard-rules rubric, auto-regenerate on failure, max 3 retries)
  → Generate infographics   (AI: per-chapter SVG visuals — 8 design patterns)
  → Synthesize episode      (AI: 25+ node knowledge graph + episode thesis)
  → Quality gate            (5-dimension eval, re-gen weak chapters if any score < 3/5)
  → Render HTML             (D3.js force graph, client-side RAG Q&A, dark theme)
```

Each stage is independently cached to disk. Re-running skips completed stages automatically.

---

## Quality pipeline

The tool includes a multi-layer quality system to ensure output is specific and useful:

1. **Critic loop** — each chapter analysis is validated against a hard-rules rubric (no filler phrases, no generic concepts, quotes must be 15+ words). Fails are automatically regenerated up to 3 times.
2. **Quality gate** — the final output is scored across 5 dimensions (text specificity, infographic completeness, knowledge graph richness, speaker attribution, insight score spread). Chapters scoring below 3/5 on any dimension are regenerated.

---

## Known limitations

- **Only 8 podcast sites are supported.** Adding a new site requires writing a scraper (see [Adding a scraper](#adding-a-new-scraper) below).
- **Transcript-based only.** The tool scrapes published transcripts — it does not transcribe audio. Episodes without a text transcript on the page will not work (except YouTube, which pulls auto-captions).
- **Very long episodes (3+ hours)** will take longer and make more AI calls. The cache means you can stop and resume at any time.
- **SVG quality varies by model** — Claude Sonnet produces the best infographics. Smaller models may fall back to simpler layouts.
- **Cost is ~$0.14/episode** on Anthropic API (Claude Sonnet). Claude Code (Pro/Max subscription) has no per-episode cost.

---

## Adding a new scraper

1. Create `lib/scrapers/<site-name>.js` exporting `scrape(url)` and `scrapeFromHtml(html, url)`
2. Register the URL pattern in `lib/scrapers/index.js`
3. Add a fixture HTML file in `test/fixtures/`
4. Add test cases in `test/scraper.test.js`
5. Update the `getSupportedSites()` test count in `test/url-router.test.js`

Each scraper must return:
```javascript
{
  title: 'Episode Title',
  guest: 'Guest Name',
  host: 'Host Name',
  podcast_name: 'Podcast Name',
  transcript: 'Full transcript text...',
  speakerMap: { 'GUEST': 42, 'HOST': 38 }
}
```

---

## Project structure

```
index.js           — CLI entry point (7-step pipeline)
lib/
  ai.js            — Multi-provider AI abstraction (Anthropic, OpenAI, Claude CLI)
  analyze.js       — Chapter enrichment + episode knowledge graph synthesis
  chapters.js      — LLM chapter detection with anchor quote resolution
  critic.js        — Per-chapter quality validation loop (max 3 retries)
  eval.js          — 5-dimension quality gate
  html.js          — HTML + D3.js + client-side RAG renderer
  infographic.js   — LLM-generated per-chapter SVG graphics (8 patterns)
  library.js       — Episode cache (URL-hash keyed)
  logger.js        — Execution log writer
  markdown.js      — Markdown export
  rag.js           — Pure-JS TF-IDF search engine
  util.js          — escapeHtml, slugify helpers
  d3.v7.min.js     — D3.js library (embedded in output HTML)
  scrapers/
    index.js       — URL router (8 sites)
    _fetch.js      — Shared HTTP helper
    acquired.js
    cheeky-pint.js
    conversations-with-tyler.js
    dwarkesh.js
    invest-like-the-best.js
    lex-fridman.js
    tbpn.js
    youtube.js
test/
  *.test.js        — Unit tests (free, no LLM calls)
  evals/           — Eval tests (paid, real LLM calls)
  fixtures/        — Saved HTML for scraper tests
```

---

## Sample episodes to try

Two publicly available episodes used during development make good first test runs:

- **Peter Thiel on Political Theology** — Conversations with Tyler · [View summary](https://htmlpreview.github.io/?https://github.com/raamcharran/podcast-summarizer/blob/master/examples/peter-thiel-cwt/summary.html)
- **How Cosplaying Ancient Rome Led to the Renaissance** — Dwarkesh Podcast · [View summary](https://htmlpreview.github.io/?https://github.com/raamcharran/podcast-summarizer/blob/master/examples/dwarkesh-renaissance/summary.html)

---

## Related

- [epub-summarizer-multiprovider](https://github.com/raamcharran/epub-summarizer-multiprovider) — the sibling tool for books. Same AI pipeline, same output format, but for EPUB files.

---

## License

MIT — see [LICENSE](LICENSE) for details.
