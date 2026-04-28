// Scraper: Dwarkesh Podcast (dwarkeshpatel.com)
// Transcripts are published on Substack-hosted episode pages.
import * as cheerio from 'cheerio';
import { fetchHtml, assertTranscript, parseSpeakerMap } from './_fetch.js';
import { gatherDescriptionText, buildPredefinedChapters } from '../native-chapters.js';

// Speaker labels appear as "Dwarkesh Patel" or "GUEST NAME" at start of paragraph
export const speakerPattern = /^([A-Z][a-zA-Z\s']{1,40}):\s*/m;

export async function scrape(url, htmlOverride) {
  const html = htmlOverride ?? await fetchHtml(url);
  return scrapeFromHtml(html, url);
}

export function scrapeFromHtml(html, url) {
  const $ = cheerio.load(html);

  const title = $('h1.post-title, h1').first().text().trim() ||
                $('meta[property="og:title"]').attr('content') ||
                'Unknown Episode';

  const guest = $('h3, .subtitle').first().text().trim() || '';

  const date = $('time').first().attr('datetime') ||
               $('time').first().text().trim() ||
               $('meta[property="article:published_time"]').attr('content') ||
               '';

  // Dwarkesh uses Substack: transcript is in .body or .post-content
  let transcriptEl = $('.body, .post-content, article').first();
  if (!transcriptEl.length) {
    throw new Error(
      'Transcript not found at expected location. The site may have changed — please report this.'
    );
  }

  const transcript = transcriptEl.text().replace(/\s+/g, ' ').trim();
  assertTranscript(transcript, url);

  const speakerMap = parseSpeakerMap(transcript, speakerPattern);
  const preDefinedChapters = buildPredefinedChapters(gatherDescriptionText($), transcript);

  return {
    title,
    podcast_name: 'Dwarkesh Podcast',
    host: 'Dwarkesh Patel',
    guest,
    date,
    transcript,
    speakerPattern,
    speakerMap,
    preDefinedChapters,
  };
}
