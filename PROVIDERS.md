# Provider Setup

This tool can route AI calls through any of the following providers:

- `codex`
- `claude-cli`
- `anthropic`
- `openai`
- `openai-compatible`

## Environment variables

```bash
export AI_PROVIDER='codex'
export AI_PROVIDER='claude-cli'
export AI_MODEL='claude-sonnet-4-6'        # optional except on claude-cli
export ANTHROPIC_API_KEY='...'
export OPENAI_API_KEY='...'
export OPENAI_BASE_URL='https://api.openai.com/v1'
export AI_TIMEOUT_MS='300000'              # optional, default 5 min
```

## Examples

Codex session (no API key needed when running inside Codex):

```bash
node index.js "https://conversationswithtyler.com/episodes/marc-andreessen/"
```

Claude CLI session (recommended — no API key needed):

```bash
# Just run it — Claude CLI is the default when no API key is set
node index.js "https://conversationswithtyler.com/episodes/marc-andreessen/"
```

Anthropic API:

```bash
export ANTHROPIC_API_KEY='sk-ant-...'
node index.js "https://dwarkeshpatel.com/some-episode/"
```

OpenAI API:

```bash
export OPENAI_API_KEY='sk-...'
export AI_MODEL='gpt-4o-mini'
node index.js "https://lexfridman.com/jensen-huang-transcript"
```

OpenAI-compatible endpoint (Ollama, Groq, Together, etc.):

```bash
export OPENAI_API_KEY='your-key'
export OPENAI_BASE_URL='http://localhost:11434/v1'
export AI_MODEL='llama3.2'
node index.js "https://youtube.com/watch?v=..."
```

## Provider auto-detection

If you don't set `AI_PROVIDER` explicitly, the tool detects which provider to use:

1. `AI_PROVIDER` explicitly set → that provider
2. Running inside Codex (`CODEX_SHELL`, `CODEX_THREAD_ID`, etc.) → `codex`
3. `OPENAI_API_KEY` + `OPENAI_BASE_URL` → `openai-compatible`
4. `OPENAI_API_KEY` alone → `openai`
5. `ANTHROPIC_API_KEY` → `anthropic`
6. None of the above → `claude-cli` (default)

## Notes

- Codex prompts are sent through `codex exec` and large prompts are streamed over stdin, so transcript-sized requests work without hitting command-line length limits.
- Cost is ~$0.14/episode on Anthropic Claude Sonnet. Claude CLI (Pro/Max subscription) has no per-episode cost.
- Claude Sonnet produces the best results. Smaller models work but may produce simpler infographics.
- The `--debug-scrape` flag does not make any AI calls — useful for testing scrapers without incurring cost.
- Cached episodes (`~/.podcast-summarizer/library/`) don't re-run AI calls unless you pass `--no-cache`.
