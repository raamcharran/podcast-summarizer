// Native chapter detection: parse chapter timestamps from a podcast page's
// show-notes / description text, and use them to slice the transcript instead
// of running LLM-based chapter detection.
//
// Used by all scrapers as a fast, deterministic alternative to lib/chapters.js.
// If no usable chapter list is found, scrapers return null and the pipeline
// falls back to the LLM-based detector at index.js:144.

/**
 * Parse `HH:MM:SS Title` / `MM:SS Title` lines from a block of description text.
 * Accepts a variety of common show-notes formats:
 *   0:00 Intro
 *   (00:00) Intro
 *   00:00 - Intro
 *   00:00:00 — Intro
 *
 * Returns an array of `{ title, startSeconds }` or null if fewer than 2 valid
 * entries were found, or if timestamps are not monotonically non-decreasing.
 */
export function parseChaptersFromDescription(description) {
  if (!description || typeof description !== 'string') return null;
  const lines = description.split(/\r?\n/);
  const chapters = [];
  // Match: optional leading "(", timestamp (H:MM:SS or M:SS), optional ")", optional separator, title
  const re = /^\s*(?:\(?\s*)?((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\s*\)?)\s*[-–—:|]?\s*(.+?)\s*$/;
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const parts = m[1].split(':').map(Number);
    let seconds;
    if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else seconds = parts[0] * 60 + parts[1];
    const title = cleanChapterTitle(m[2]);
    if (!title) continue;
    // Skip titles that are themselves timestamps or too short to be meaningful
    if (title.length < 2) continue;
    chapters.push({ title, startSeconds: seconds });
  }
  if (chapters.length < 2) return null;
  for (let i = 1; i < chapters.length; i++) {
    if (chapters[i].startSeconds < chapters[i - 1].startSeconds) return null;
  }
  return chapters;
}

// Strip trailing punctuation, collapse whitespace, cap length.
function cleanChapterTitle(raw) {
  let t = raw.replace(/\s+/g, ' ').trim();
  t = t.replace(/^[-–—:|\s]+/, '').replace(/[-–—:|\s]+$/, '');
  if (t.length > 80) t = t.slice(0, 80).replace(/\s+\S*$/, '').trim();
  return t;
}

/**
 * Split a plain-text transcript into chapter text slices using relative
 * chapter start times. Assumes the transcript plays back at roughly uniform
 * pace, so the fraction of the transcript belonging to chapter i is
 * proportional to the time interval it covers.
 *
 * The last chapter's length is estimated as the average of prior chapter
 * gaps. Returns an array of strings, one per chapter, snapped to paragraph
 * boundaries where possible.
 */
export function splitTranscriptProportionally(transcript, chapters) {
  const n = chapters.length;
  if (n === 0) return [];
  if (n === 1) return [transcript];

  const starts = chapters.map(c => c.startSeconds);
  // Estimate last chapter duration: use the average of prior gaps, or the last
  // known gap if that's all we have.
  const priorGaps = [];
  for (let i = 1; i < n; i++) priorGaps.push(starts[i] - starts[i - 1]);
  const avgGap = priorGaps.reduce((a, b) => a + b, 0) / priorGaps.length;
  const lastGap = avgGap > 0 ? avgGap : priorGaps[priorGaps.length - 1] || 1;
  const totalDur = (starts[n - 1] - starts[0]) + lastGap;

  // Compute byte boundaries, then snap each to the nearest paragraph/newline
  // boundary to avoid cutting sentences mid-word.
  const len = transcript.length;
  const boundaries = [0];
  for (let i = 1; i < n; i++) {
    const frac = (starts[i] - starts[0]) / totalDur;
    const raw = Math.floor(len * frac);
    boundaries.push(snapToBoundary(transcript, raw));
  }
  boundaries.push(len);

  const result = [];
  for (let i = 0; i < n; i++) {
    const slice = transcript.slice(boundaries[i], boundaries[i + 1]).trim();
    result.push(slice);
  }
  return result;
}

// Snap a byte offset to the nearest newline or sentence boundary within a
// small window, preferring newlines. Falls back to word boundaries.
function snapToBoundary(text, pos) {
  const WINDOW = 400;
  const lo = Math.max(0, pos - WINDOW);
  const hi = Math.min(text.length, pos + WINDOW);
  // Prefer a newline closest to pos
  let best = -1;
  let bestDist = Infinity;
  for (let i = lo; i < hi; i++) {
    if (text[i] === '\n') {
      const d = Math.abs(i - pos);
      if (d < bestDist) { bestDist = d; best = i; }
    }
  }
  if (best !== -1) return best + 1;
  // Fallback: sentence boundary (. ! ?)
  for (let i = lo; i < hi; i++) {
    if (/[.!?]/.test(text[i]) && text[i + 1] === ' ') {
      const d = Math.abs(i - pos);
      if (d < bestDist) { bestDist = d; best = i + 2; }
    }
  }
  if (best !== -1) return best;
  // Last resort: nearest word boundary
  for (let i = pos; i < hi; i++) if (text[i] === ' ') return i + 1;
  return pos;
}

/**
 * Split an array of timestamped segments (YouTube/Lex/Spotify-style) into
 * chapter text slices by matching segment start times to chapter start times.
 * Each segment must have `{ startSeconds, text }`.
 */
export function splitSegmentsByTime(segments, chapters) {
  const chapterTexts = chapters.map(() => []);
  for (const seg of segments) {
    const t = Number(seg.startSeconds) || 0;
    let idx = 0;
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (t >= chapters[i].startSeconds) { idx = i; break; }
    }
    const text = (seg.text || '').trim();
    if (text) chapterTexts[idx].push(text);
  }
  return chapterTexts.map(parts => parts.join(' ').replace(/\s+/g, ' ').trim());
}

/**
 * Collect candidate description/show-notes text from a cheerio-parsed page.
 *
 * Scans several common locations where podcast sites embed chapter timestamp
 * lists: meta description tags, and DOM elements whose class hints at
 * show-notes / chapters / episode-notes / description / timestamps. Each
 * element's text is joined with newlines so line-based timestamp parsing
 * still works.
 *
 * Intentionally broad — `parseChaptersFromDescription` is strict (requires
 * lines starting with timestamps, monotonic order, ≥2 entries), so over-
 * collection rarely produces false positives.
 */
export function gatherDescriptionText($) {
  const parts = [];
  const metaDesc = $('meta[name="description"]').attr('content');
  if (metaDesc) parts.push(metaDesc);
  const ogDesc = $('meta[property="og:description"]').attr('content');
  if (ogDesc) parts.push(ogDesc);

  const selectors = [
    '[class*="show-notes"]',
    '[class*="shownotes"]',
    '[class*="episode-notes"]',
    '[class*="episode-description"]',
    '[class*="episode-summary"]',
    '[class*="description"]',
    '[class*="chapters"]',
    '[class*="timestamps"]',
    '[id*="show-notes"]',
    '[id*="chapters"]',
    '[data-testid="episode-description"]',
  ];
  for (const sel of selectors) {
    $(sel).each((_, el) => {
      // Preserve block structure: replace each block child with its text + \n
      const $el = $(el);
      // Build newline-separated text from block descendants
      const txt = blockText($, $el);
      if (txt) parts.push(txt);
    });
  }
  return parts.join('\n\n');
}

// Extract text from a cheerio element, inserting newlines between block-level
// children so line-based parsing can find timestamp-prefixed lines.
function blockText($, $el) {
  const lines = [];
  const blocks = $el.find('p, li, div, br').addBack();
  blocks.each((_, child) => {
    const $c = $(child);
    // Use own text (not descendants) to avoid duplication
    const ownText = $c.clone().children().remove().end().text().trim();
    if (ownText) lines.push(ownText);
  });
  // Fallback: if nothing picked up, use flat .text()
  if (!lines.length) return $el.text().trim();
  return lines.join('\n');
}

/**
 * High-level helper for scrapers: given a chunk of description text and a
 * transcript, try to build preDefinedChapters using proportional splitting.
 * Returns an array of `{ title, text, speakerMap }` or null on failure.
 */
export function buildPredefinedChapters(description, transcript) {
  const chapters = parseChaptersFromDescription(description);
  if (!chapters) return null;
  const texts = splitTranscriptProportionally(transcript, chapters);
  const result = chapters.map((ch, i) => ({
    title: ch.title,
    text: texts[i] || '',
    speakerMap: {},
  })).filter(ch => ch.text.length > 0);
  // Require at least 2 non-empty chapters
  if (result.length < 2) return null;
  return result;
}
