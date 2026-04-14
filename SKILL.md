---
name: podcast
description: Turn a podcast episode URL into a self-contained interactive HTML summary (chapter infographics, D3 knowledge graph, speaker attribution, RAG Q&A). Use when the user wants to summarize, analyze, or generate a visual summary from a podcast episode URL. Supported sites - Conversations with Tyler, Dwarkesh, Cheeky Pint, Invest Like the Best, TBPN, Acquired, Lex Fridman, YouTube.
---

# podcast

Runs the local `podcast-summarizer` CLI to transform a podcast episode URL into a self-contained HTML infographic.

## How to invoke

The user will typically run `/podcast <episode-url>` or ask you to summarize a podcast.

Run the tool from this skill directory:

```bash
cd ~/.claude/skills/podcast && node index.js "<episode-url>"
```

Output goes to `~/.claude/skills/podcast/output/<episode-slug>.html` (plus `.md`, `.rag.json`, `.log.json`). Report the absolute path back to the user so they can open it.

Typical run time is **10-30 minutes** depending on transcript length. Start the command with `run_in_background: true` and poll it with the Monitor/TaskOutput tools rather than blocking the conversation.

## Flags

- `--no-cache` — ignore the episode cache and do a full re-run
- `--regen-synthesis` — re-run knowledge graph only (uses cached chapters)
- `--debug-scrape` — print scraped transcript and exit (fast sanity check)
- `--out <dir>` — custom output directory
- `--html <file>` — use local HTML instead of fetching
- `--json <file>` — load transcript from JSON file

## Supported URL patterns

| Podcast | URL pattern |
|---|---|
| Conversations with Tyler | `conversationswithtyler.com/episodes/*` |
| Dwarkesh Podcast | `dwarkeshpatel.com/*` or `dwarkesh.com/*` |
| Invest Like the Best | `joincolossus.com/episodes/*` or `colossus.com/*` |
| Lex Fridman | `lexfridman.com/*-transcript` |
| Acquired | `acquired.fm/episodes/*` |
| TBPN | `open.spotify.com/episode/*` or `tbpn.com/*` |
| Cheeky Pint | `cheekypint.com/episodes/*` |
| YouTube | `youtube.com/watch?v=*` or `youtu.be/*` |

If the URL doesn't match any supported site, tell the user and do not attempt to run the tool.

## Provider

The tool auto-detects the AI provider. On this machine, the user runs Claude Code with an active Pro/Max session, so **no API key is needed** — the tool will fall back to the Claude CLI session automatically. Do not set `ANTHROPIC_API_KEY` unless the user asks.

## Pre-flight checks before first run

1. Confirm `node_modules/` exists in `~/.claude/skills/podcast/`. If missing, run `npm install` there first.
2. Verify Node.js 18+ is available (`node --version`).

## On failure

- If scraping fails, try `--debug-scrape` first to see what was fetched.
- If a stage fails mid-pipeline, just re-run the same command — stages are cached and will resume.
- Check `output/<slug>.log.json` for timings, critic retries, and eval scores.

## Don't

- Don't transcribe audio — the tool only works on sites with published transcripts (YouTube uses auto-captions).
- Don't run the test suite unless the user asks.
- Don't modify episode JSON files in the repo root — those are development fixtures.
