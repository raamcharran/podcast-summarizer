# podcast-summarizer

Turns a podcast episode URL into a self-contained HTML infographic — AI chapter summaries, insight scores, speaker attribution, and D3.js knowledge graph.

## Quick start

```bash
node index.js <episode-url>
node index.js <episode-url> --no-cache          # skip episode cache (full re-run)
node index.js <episode-url> --regen-synthesis  # re-run knowledge graph only (uses cached chapters/analyses)
node index.js <episode-url> --debug-scrape     # print scraped transcript and exit
node index.js <episode-url> --out ./out        # custom output directory (default: ./output)
```

Output files written to `./output/`:
- `<slug>.html` — self-contained HTML infographic (open in browser)
- `<slug>.md` — Markdown export of all chapter summaries
- `<slug>.log.json` — step timings, critic retries, eval scores, warnings

Episode cache lives at `~/.podcast-summarizer/library/`. Use `--no-cache` to force re-scrape.

## Supported podcasts

| Podcast | URL pattern |
|---------|-------------|
| Conversations with Tyler | `conversationswithtyler.com/episodes/*` |
| Dwarkesh Podcast | `dwarkeshpatel.com/*` |
| Cheeky Pint | `cheekypint.com/episodes/*` |
| Invest Like the Best | `joincolossus.com/episodes/*` |
| TBPN | `open.spotify.com/episode/*` or `tbpn.com/*` |
| Acquired | `acquired.fm/episodes/*` |
| YouTube | `youtube.com/watch?v=*` or `youtu.be/*` |

## AI provider setup

The tool auto-detects the provider from environment variables:

```bash
# Anthropic (recommended)
export ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
export OPENAI_API_KEY=sk-...

# OpenAI-compatible (Ollama, Together, etc.)
export OPENAI_API_KEY=...
export OPENAI_BASE_URL=http://localhost:11434/v1
export AI_MODEL=llama3.2

# Claude CLI session (no API key needed if logged in)
# falls back to this automatically when no key is set
```

Cost: ~$0.14/episode on Anthropic claude-sonnet-4-6.

## Testing

```bash
npm test            # free-tier unit tests (no LLM, no network) — run always
npm run test:evals  # paid eval tests (real LLM calls) — run before shipping
```

### Test structure

```
test/
├── chapters.test.js      — anchor quote lookup logic (exact, fuzzy, fallback)
├── error-paths.test.js   — assertTranscript errors, parseSpeakerMap edge cases
├── library.test.js       — episode cache hit/miss, hash stability
├── scraper.test.js       — all 7 scrapers via HTML fixtures (no network)
├── url-router.test.js    — URL routing, unsupported site rejection
├── fixtures/             — saved HTML for scraper tests
│   ├── cwt-episode.html
│   ├── dwarkesh-episode.html
│   ├── cheeky-pint-episode.html
│   ├── iltb-episode.html
│   ├── lex-fridman-episode.html
│   ├── tbpn-episode.html
│   ├── acquired-episode.html
│   └── youtube-episode.html
└── evals/
    ├── critic.eval.test.js     — critic loop with real LLM (paid)
    └── eval-gate.eval.test.js  — 5-dimension quality gate (paid)
```

### Test expectations

- 100% free-tier tests must pass before every commit (`npm test`)
- Run `npm run test:evals` before shipping major changes to analysis/critic/eval logic
- When adding a new scraper, add a fixture HTML file and tests in `scraper.test.js`
- When fixing a scraper bug, add a regression test with the relevant HTML pattern
- When adding a new fail condition to the critic, add a test case in `critic.eval.test.js`

## Project structure

```
lib/
├── ai.js           — provider-agnostic LLM client (Anthropic / OpenAI / Claude CLI)
├── analyze.js      — chapter enrichment + episode synthesis (LLM)
├── chapters.js     — LLM chapter detection with anchor quote resolution
├── critic.js       — per-chapter quality critic loop (max 2 retries)
├── eval.js         — 5-dimension final quality gate
├── html.js         — HTML infographic renderer with D3.js
├── library.js      — URL-hash episode cache (~/.podcast-summarizer/library/)
├── logger.js       — run logger → output/<slug>.log.json
├── markdown.js     — Markdown export
├── util.js         — escapeHtml, slugify
└── scrapers/
    ├── index.js                    — URL router
    ├── _fetch.js                   — shared HTTP helper + transcript utils
    ├── conversations-with-tyler.js
    ├── dwarkesh.js
    ├── cheeky-pint.js
    ├── invest-like-the-best.js
    ├── tbpn.js
    ├── acquired.js
    └── youtube.js
index.js            — 7-step pipeline CLI entry point
```

## Pipeline steps

1. **Scrape** — fetch episode HTML, extract transcript + speaker map
2. **Cache check** — return cached result if episode was processed before
3. **Chapters** — LLM detects chapter boundaries from anchor quotes
4. **Enrich** — LLM generates summary, key quote, concept chips, insight scores per chapter (p-limit 4)
5. **Critic** — hard-rules rubric validates each chapter; re-generates on fail (max 2 retries)
6. **Synthesize + eval** — LLM builds knowledge graph + episode thesis; quality gate checks 5 dimensions
7. **Render** — HTML infographic + Markdown + log file written to disk

## Adding a new scraper

1. Create `lib/scrapers/<site-name>.js`
2. Export `scrapeFromHtml(html, url)` returning `{ title, guest, host, podcast_name, transcript, speakerPattern, speakerMap }`
3. Export `scrape(url)` that calls `fetchHtml` then `scrapeFromHtml`
4. Register the URL pattern in `lib/scrapers/index.js`
5. Add a fixture HTML file in `test/fixtures/`
6. Add scraper tests in `test/scraper.test.js`
7. Update `getSupportedSites` test count in `test/url-router.test.js`
