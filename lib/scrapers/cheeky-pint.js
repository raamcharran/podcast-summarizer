// Scraper: Cheeky Pint Podcast (cheekypint.com)
import * as cheerio from 'cheerio';
import { fetchHtml, assertTranscript, parseSpeakerMap } from './_fetch.js';
import { gatherDescriptionText, buildPredefinedChapters } from '../native-chapters.js';

export const speakerPattern = /^([A-Z][A-Z\s']{1,30}):\s*/m;

export async function scrape(url, htmlOverride) {
  const html = htmlOverride ?? await fetchHtml(url);
  return scrapeFromHtml(html, url);
}

export function scrapeFromHtml(html, url) {
  const $ = cheerio.load(html);

  const title = $('h1').first().text().trim() ||
                $('meta[property="og:title"]').attr('content') ||
                'Unknown Episode';

  const guest = $('h2').first().text().trim() ||
                $('[class*="guest"], [class*="subtitle"]').first().text().trim() ||
                '';

  const date = $('time').first().attr('datetime') ||
               $('time').first().text().trim() ||
               $('meta[property="article:published_time"]').attr('content') ||
               '';

  let transcriptEl = $('[class*="transcript"], .entry-content, article, main').first();
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
    podcast_name: 'Cheeky Pint',
    host: '',
    guest,
    date,
    transcript,
    speakerPattern,
    speakerMap,
    preDefinedChapters,
  };
}
