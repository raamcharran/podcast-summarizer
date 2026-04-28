// Scraper: Lex Fridman Podcast (lexfridman.com)
// Transcripts use structured .ts-segment elements with .ts-name, .ts-timestamp, .ts-text.
import * as cheerio from 'cheerio';
import { fetchHtml, assertTranscript, parseSpeakerMap } from './_fetch.js';
import {
  gatherDescriptionText,
  buildPredefinedChapters,
  parseChaptersFromDescription,
  splitSegmentsByTime,
} from '../native-chapters.js';

// Speaker labels appear as "Lex Fridman" or "GUEST NAME:" at start of lines in the
// reconstructed transcript (we inject "NAME: " when building the transcript string).
export const speakerPattern = /^([A-Z][a-zA-Z\s']{1,40}):\s*/m;

function transcriptUrl(url) {
  const u = url.replace(/\/$/, '');
  return u.endsWith('-transcript') ? u : u + '-transcript';
}

export async function scrape(url, htmlOverride) {
  const tUrl = transcriptUrl(url);
  const html = htmlOverride ?? await fetchHtml(tUrl);
  return scrapeFromHtml(html, tUrl);
}

export function scrapeFromHtml(html, url) {
  const $ = cheerio.load(html);

  // Title is in OG meta; the page H1 is just "Lex Fridman"
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  // Strip "Transcript for " prefix and " - Lex Fridman" / "| Lex Fridman" suffix
  const title = ogTitle
    .replace(/^Transcript for\s+/i, '')
    .replace(/\s*[-|]\s*Lex Fridman\s*$/i, '')
    .trim() ||
                $('h1').first().text().trim() ||
                'Unknown Episode';

  // Guest: first non-"Lex Fridman" speaker, or extract from title
  // Title format: "Transcript for GUEST: ..." or "GUEST: TOPIC | Lex Fridman Podcast #N"
  const titleGuestMatch = title.match(/^(?:Transcript for )?(.+?)[:–—]/);
  const guest = titleGuestMatch ? titleGuestMatch[1].trim() : '';

  const date = $('time').first().attr('datetime') ||
               $('time').first().text().trim() ||
               $('meta[property="article:published_time"]').attr('content') || '';

  // Build transcript from structured segments, preserving speaker attribution.
  // Also capture each segment's start time (from .ts-timestamp as "(HH:MM:SS)")
  // so we can split the transcript by native chapter timestamps later.
  const segments = [];
  const timedSegments = [];
  $('.ts-segment').each((_, el) => {
    const speaker = $(el).find('.ts-name').text().trim();
    const text = $(el).find('.ts-text').text().trim();
    const tsRaw = $(el).find('.ts-timestamp').text().trim();
    if (text) {
      const line = speaker ? `${speaker}: ${text}` : text;
      segments.push(line);
      timedSegments.push({ startSeconds: parseLexTimestamp(tsRaw), text: line });
    }
  });

  if (!segments.length) {
    throw new Error(
      'Transcript not found. Expected .ts-segment elements — the site may have changed.'
    );
  }

  const transcript = segments.join('\n');
  assertTranscript(transcript, url);

  const speakerMap = parseSpeakerMap(transcript, speakerPattern);

  // Native chapter detection: prefer timestamp-accurate splitting via segment
  // offsets. Fall back to proportional splitting (via buildPredefinedChapters)
  // if the description has chapter markers but segment times weren't parsed.
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

  // Episode page URL: strip "-transcript" suffix from the transcript URL
  const episodeUrl = url.replace(/-transcript\/?$/, '');

  return {
    title,
    podcast_name: 'Lex Fridman Podcast',
    host: 'Lex Fridman',
    guest,
    date,
    episodeUrl,
    transcript,
    speakerPattern,
    speakerMap,
    preDefinedChapters,
  };
}

// Parse "(HH:MM:SS)" or "(MM:SS)" → seconds. Returns 0 on failure.
function parseLexTimestamp(raw) {
  if (!raw) return 0;
  const m = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return 0;
  const h = m[3] ? Number(m[1]) : 0;
  const min = m[3] ? Number(m[2]) : Number(m[1]);
  const s = m[3] ? Number(m[3]) : Number(m[2]);
  return h * 3600 + min * 60 + s;
}
