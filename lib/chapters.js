// Chapter detection — LLM-only segmentation using verbatim anchor quotes
import { generateText, parseJsonResponse } from './ai.js';

const CHAPTER_SYSTEM = `You are a podcast chapter detector.
Given a full transcript, identify all thematic chapters/topics — as many as the content warrants.
For each chapter, return the EXACT first 10-15 words as they appear in the transcript as the start_quote.
Return ONLY valid JSON — no markdown fences, no commentary.`;

function buildChapterPrompt(transcript, speakerMap) {
  const speakerHint = Object.keys(speakerMap || {}).length
    ? `Speakers in this transcript: ${Object.keys(speakerMap).join(', ')}.`
    : '';

  return `${speakerHint}

Transcript (${transcript.split(/\s+/).length} words):
---
${transcript}
---

Return a JSON array of chapters. Each chapter must have:
- title: string — descriptive chapter title (5-10 words)
- start_quote: string — EXACT verbatim first 10-15 words of this chapter from the transcript above
- speaker_map: object — keys are speaker names, values are turn counts for this chapter (omit if no speaker labels)

Rules:
- Minimum 2 chapters, no maximum — use as many as the content warrants
- Chapters must be in order
- start_quote must be findable verbatim in the transcript
- The first chapter's start_quote should be near the beginning of the transcript

Return ONLY the JSON array.`;
}

// Find position of anchor quote in transcript.
// Falls back to fuzzy match on first 6 words, then proportional position.
function findAnchorPosition(transcript, startQuote, fallbackIndex, total) {
  // Exact match
  const pos = transcript.indexOf(startQuote);
  if (pos !== -1) return pos;

  // Fuzzy: first 6 words
  const shortQuote = startQuote.split(/\s+/).slice(0, 6).join(' ');
  const fuzzyPos = transcript.indexOf(shortQuote);
  if (fuzzyPos !== -1) {
    console.warn(`[chapters] Fuzzy anchor match for: "${shortQuote}"`);
    return fuzzyPos;
  }

  // Proportional fallback
  const approxPos = Math.floor((fallbackIndex / total) * transcript.length);
  console.warn(`[chapters] Anchor not found: "${startQuote.slice(0, 40)}…" — using proportional position`);
  return approxPos;
}

function fixedSegments(transcript, count = 6) {
  const words = transcript.split(/\s+/);
  const size = Math.ceil(words.length / count);
  const chapters = [];
  for (let i = 0; i < count; i++) {
    const start = i * size;
    const slice = words.slice(start, start + size);
    if (!slice.length) break;
    chapters.push({
      title: `Part ${i + 1}`,
      text: slice.join(' '),
      speakerMap: {},
    });
  }
  return chapters;
}

export async function detectChapters(transcript, speakerMap, config, logger) {
  logger?.step('chapters_start', { transcript_words: transcript.split(/\s+/).length });

  let raw;
  try {
    raw = await generateText({
      system: CHAPTER_SYSTEM,
      prompt: buildChapterPrompt(transcript, speakerMap),
      maxTokens: 4096,
      config,
    });
  } catch (err) {
    logger?.warn('chapter_llm_failed', { error: err.message });
    return fixedSegments(transcript);
  }

  let parsed;
  try {
    parsed = parseJsonResponse(raw);
  } catch {
    logger?.warn('chapter_parse_failed', { raw: raw.slice(0, 200) });
    return fixedSegments(transcript);
  }

  if (!Array.isArray(parsed) || parsed.length < 2) {
    // Retry with relaxed prompt
    logger?.warn('chapter_too_few', { count: parsed?.length });
    try {
      const relaxedRaw = await generateText({
        system: CHAPTER_SYSTEM,
        prompt: buildChapterPrompt(transcript, speakerMap) +
          '\n\nIMPORTANT: You MUST return at least 2 chapters. If in doubt, split at the halfway point.',
        maxTokens: 2048,
        config,
      });
      parsed = parseJsonResponse(relaxedRaw);
    } catch {
      return fixedSegments(transcript);
    }
    if (!Array.isArray(parsed) || parsed.length < 2) {
      return fixedSegments(transcript);
    }
  }

  // Resolve anchor positions → extract chapter text slices
  const chapters = [];
  const total = parsed.length;

  for (let i = 0; i < total; i++) {
    const ch = parsed[i];
    const startPos = findAnchorPosition(transcript, ch.start_quote || '', i, total);
    const nextStartPos = i + 1 < total
      ? findAnchorPosition(transcript, parsed[i + 1].start_quote || '', i + 1, total)
      : transcript.length;

    const text = transcript.slice(startPos, nextStartPos).trim();
    const id = `ch-${i + 1}-${(ch.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`;

    chapters.push({
      id,
      title: ch.title || `Chapter ${i + 1}`,
      text,
      speakerMap: ch.speaker_map || {},
    });
  }

  logger?.step('chapters_done', { count: chapters.length });
  return chapters;
}
