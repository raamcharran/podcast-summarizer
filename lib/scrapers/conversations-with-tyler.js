// Scraper: Conversations with Tyler (conversationswithtyler.com)
// Transcripts are published on episode pages as structured HTML.
import * as cheerio from 'cheerio';
import { fetchHtml, assertTranscript, parseSpeakerMap } from './_fetch.js';
import { gatherDescriptionText, buildPredefinedChapters } from '../native-chapters.js';

// Speaker labels appear as "COWEN:" or "TYLER COWEN:" at line start
export const speakerPattern = /^([A-Z][A-Z\s']{1,30}):\s*/m;

export async function scrape(url, htmlOverride) {
  const html = htmlOverride ?? await fetchHtml(url);
  return scrapeFromHtml(html, url);
}

export function scrapeFromHtml(html, url) {
  const $ = cheerio.load(html);

  // Title: CWT uses .episode__title, fallback to og:title meta
  const title = $('.episode__title').first().text().trim() ||
                $('meta[property="og:title"]').attr('content') ||
                $('h1').first().text().trim() ||
                'Unknown Episode';

  // Guest: episode titles follow "Name on Topic (Ep. N)" pattern
  const guestMatch = title.match(/^(.+?)\s+on\s+/i);
  const guest = guestMatch
    ? guestMatch[1].trim()
    : ($('[class*="guest"]').first().text().trim() || '');

  // Date: use visible text of <time> (datetime attr can be stale)
  const date = $('time').first().text().trim() ||
               $('time').first().attr('datetime') ||
               $('meta[property="article:published_time"]').attr('content') ||
               '';

  // Transcript: CWT historically uses .text-block > .graf paragraphs (Medium-style).
  // Newer episodes use plain <p> tags inside .text-block instead.
  // Join each paragraph on its own line so speaker-label regex (/^SPEAKER:/m) works.
  let grafParas = $('.text-block .graf')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(t => t.length > 0);

  // Newer CWT pages use plain <p> inside .text-block without .graf class
  if (grafParas.join(' ').split(/\s+/).length < 500) {
    const plainParas = $('.text-block p')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(t => t.length > 0);
    if (plainParas.join(' ').split(/\s+/).length > grafParas.join(' ').split(/\s+/).length) {
      grafParas = plainParas;
    }
  }

  // Fallback chain: [class*="transcript"] → article → throw
  if (!grafParas.length) {
    let transcriptEl = $('[class*="transcript"]').first();
    if (!transcriptEl.length) transcriptEl = $('article').first();
    if (!transcriptEl.length) {
      throw new Error(
        'Transcript not found at expected location. The site may have changed — please report this.'
      );
    }
    const transcript = transcriptEl.text().replace(/\s+/g, ' ').trim();
    assertTranscript(transcript, url);
    const speakerMap = parseSpeakerMap(transcript, speakerPattern);
    const preDefinedChapters = buildPredefinedChapters(gatherDescriptionText($), transcript);
    return { title, podcast_name: 'Conversations with Tyler', host: 'Tyler Cowen', guest, date, transcript, speakerPattern, speakerMap, preDefinedChapters };
  }

  const transcript = grafParas.join('\n');
  assertTranscript(transcript, url);

  const speakerMap = parseSpeakerMap(transcript, speakerPattern);
  const preDefinedChapters = buildPredefinedChapters(gatherDescriptionText($), transcript);

  return {
    title,
    podcast_name: 'Conversations with Tyler',
    host: 'Tyler Cowen',
    guest,
    date,
    transcript,
    speakerPattern,
    speakerMap,
    preDefinedChapters,
  };
}
