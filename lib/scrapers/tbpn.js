// Scraper: TBPN / Spotify Podcasts
// Spotify pages are JavaScript SPAs. For best results, save the full page as HTML
// with the Transcript section expanded, then pass via htmlOverride or --json mode.
// Direct fetch may work if Spotify serves server-rendered HTML for the URL.
import * as cheerio from 'cheerio';
import { fetchHtml, assertTranscript, parseSpeakerMap } from './_fetch.js';
import {
  gatherDescriptionText,
  buildPredefinedChapters,
  parseChaptersFromDescription,
  splitSegmentsByTime,
} from '../native-chapters.js';

// Spotify auto-transcripts use "Speaker N" labels.
// We normalize to "Speaker N: text" format for downstream processing.
export const speakerPattern = /^(Speaker \d+):\s*/m;

export async function scrape(url, htmlOverride) {
  const html = htmlOverride ?? await fetchHtml(url);
  return scrapeFromHtml(html, url);
}

export function scrapeFromHtml(html, url) {
  const $ = cheerio.load(html);

  // --- Title ---
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() || '';
  const pageTitle = $('title').text().trim();
  const h1 = $('h1').first().text().trim();
  const title = ogTitle || h1 ||
    pageTitle.replace(/\s*[\|–-]\s*(?:Podcast on )?Spotify\s*$/i, '').trim() ||
    'Unknown Episode';

  // --- Podcast name ---
  // Spotify titles: "Episode Title - Show Name | Podcast on Spotify"
  // Strip Spotify suffix, then take text after the last dash separator.
  const cleanPageTitle = pageTitle.replace(/\s*\|\s*(?:Podcast on )?Spotify\s*$/i, '');
  const lastDash = Math.max(cleanPageTitle.lastIndexOf(' - '), cleanPageTitle.lastIndexOf(' — '));
  const podcast_name = lastDash >= 0
    ? cleanPageTitle.slice(lastDash).replace(/^\s*[-–—]\s*/, '').trim()
    : 'TBPN';

  // --- Date ---
  const date = $('time').first().attr('datetime') ||
    $('meta[property="music:release_date"]').attr('content') ||
    $('meta[property="article:published_time"]').attr('content') || '';

  // --- Transcript extraction ---
  let transcript = '';
  // Timed segments captured from strategy 1 (used for native chapter splitting)
  const timedSegments = [];

  // Strategy 1: Structured transcript segments (Spotify DOM with data-testid)
  const segEls = $('[data-testid="transcript-segment"]');
  if (segEls.length) {
    let currentSpeaker = 'Speaker 1';
    const lines = [];
    segEls.each((_, el) => {
      const speaker = $(el).find('[data-testid="transcript-speaker"]').text().trim();
      const text = $(el).find('[data-testid="transcript-text"]').text().trim() ||
        $(el).contents().filter(function () {
          return this.type === 'text' || (this.type === 'tag' && !$(this).is('button, [data-testid="transcript-timestamp"], [data-testid="transcript-speaker"]'));
        }).text().trim();
      const tsRaw = $(el).find('[data-testid="transcript-timestamp"]').text().trim();
      if (speaker) currentSpeaker = speaker;
      if (text) {
        const line = `${currentSpeaker}: ${text}`;
        lines.push(line);
        timedSegments.push({ startSeconds: parseShortTimestamp(tsRaw), text: line });
      }
    });
    transcript = lines.join('\n');
  }

  // Strategy 2: Transcript container exists but without structured segments — parse raw text
  if (!transcript) {
    const container = $('[data-testid="transcript"], [aria-label="Transcript"], .transcript-content, [class*="transcript"]').first();
    if (container.length) {
      transcript = parseRawTranscript(container.text());
    }
  }

  // Strategy 3: Full page text fallback
  if (!transcript) {
    const mainText = $('main, article, [role="main"]').first().text() || $('body').text();
    transcript = parseRawTranscript(mainText);
  }

  if (!transcript) {
    throw new Error(
      'Transcript not found. Spotify pages are SPAs — save the page as complete HTML ' +
      'with the Transcript section expanded, or use --json mode.'
    );
  }

  assertTranscript(transcript, url);
  const speakerMap = parseSpeakerMap(transcript, speakerPattern);

  // Native chapter detection: try timestamp-accurate splitting if we captured
  // segment timings; otherwise fall back to proportional splitting.
  const description = gatherDescriptionText($);
  let preDefinedChapters = null;
  const descChapters = parseChaptersFromDescription(description);
  if (descChapters && timedSegments.some(s => s.startSeconds > 0)) {
    const texts = splitSegmentsByTime(timedSegments, descChapters);
    const built = descChapters.map((ch, i) => ({
      title: ch.title,
      text: texts[i] || '',
      speakerMap: {},
    })).filter(ch => ch.text.length > 0);
    if (built.length >= 2) preDefinedChapters = built;
  }
  if (!preDefinedChapters) {
    preDefinedChapters = buildPredefinedChapters(description, transcript);
  }

  return {
    title,
    podcast_name,
    host: '',
    guest: '',
    date,
    transcript,
    speakerPattern,
    speakerMap,
    preDefinedChapters,
  };
}

// Parse "H:MM:SS" / "MM:SS" / "M:SS" → seconds. Returns 0 on failure.
function parseShortTimestamp(raw) {
  if (!raw) return 0;
  const m = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return 0;
  const h = m[3] ? Number(m[1]) : 0;
  const min = m[3] ? Number(m[2]) : Number(m[1]);
  const s = m[3] ? Number(m[3]) : Number(m[2]);
  return h * 3600 + min * 60 + s;
}

/**
 * Parse raw transcript text that has timestamps and "Speaker N" labels mixed in.
 * Spotify transcripts follow this pattern:
 *   0:00 Welcome to the show... 0:18 Speaker 2 Thanks for having me...
 * We split on timestamps and reconstruct "Speaker N: text" lines.
 */
function parseRawTranscript(text) {
  if (!text) return '';

  // Split on timestamp patterns (M:SS, MM:SS, H:MM:SS)
  // Use a capture group so we keep the timestamps for boundary detection
  const parts = text.split(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);

  let currentSpeaker = 'Speaker 1';
  const lines = [];
  let prevWasTimestamp = false;

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Skip timestamp tokens
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      prevWasTimestamp = true;
      continue;
    }

    // Only process chunks that followed a timestamp (avoids grabbing nav text etc.)
    if (!prevWasTimestamp) continue;
    prevWasTimestamp = false;

    // Check if chunk starts with "Speaker N"
    const speakerMatch = trimmed.match(/^(Speaker \d+)\s+([\s\S]*)$/);
    if (speakerMatch) {
      currentSpeaker = speakerMatch[1];
      const body = speakerMatch[2].trim();
      if (body) lines.push(`${currentSpeaker}: ${body}`);
    } else {
      lines.push(`${currentSpeaker}: ${trimmed}`);
    }
  }

  return lines.join('\n');
}
