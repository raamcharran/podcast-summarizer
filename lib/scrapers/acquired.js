// Scraper: Acquired Podcast (acquired.fm)
// Transcripts are published on episode pages in a .transcript-container element.
import * as cheerio from 'cheerio';
import { fetchHtml, assertTranscript, parseSpeakerMap } from './_fetch.js';
import { gatherDescriptionText, buildPredefinedChapters } from '../native-chapters.js';

// Speaker labels appear as "David:", "Ben:", "Colin:" at line start (first names, mixed case)
export const speakerPattern = /^([A-Z][a-zA-Z\s']{1,40}):\s*/m;

export async function scrape(url, htmlOverride) {
  const html = htmlOverride ?? await fetchHtml(url);
  return scrapeFromHtml(html, url);
}

export function scrapeFromHtml(html, url) {
  const $ = cheerio.load(html);

  // Title: h1, fallback to og:title (strip " | Acquired Podcast" suffix)
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const title = $('h1').first().text().trim() ||
                ogTitle.replace(/\s*\|\s*Acquired Podcast\s*$/i, '').trim() ||
                'Unknown Episode';

  // Date: div.blog-date (visible one)
  const date = $('div.blog-date').not('.w-condition-invisible').first().text().trim() ||
               $('div.blog-date').first().text().trim() ||
               $('meta[property="article:published_time"]').attr('content') || '';

  // Guest: Acquired episodes don't always have a guest. Check for a third speaker.
  // The hosts are Ben Gilbert and David Rosenthal.
  const hosts = new Set(['ben', 'david']);

  // Transcript: inside .transcript-container, in the last .w-richtext div (first one is the disclaimer)
  const transcriptEl = $('.transcript-container .w-richtext').last();
  if (!transcriptEl.length) {
    // Fallback: try any w-richtext with many <p> children
    const fallback = $('.w-richtext').filter((_, el) => $(el).children('p').length > 50).last();
    if (!fallback.length) {
      throw new Error(
        'Transcript not found. Expected .transcript-container element — the site may have changed.'
      );
    }
    return buildResult($, fallback, title, date, url, hosts);
  }

  return buildResult($, transcriptEl, title, date, url, hosts);
}

function buildResult($, transcriptEl, title, date, url, hosts) {
  const description = gatherDescriptionText($);
  const paragraphs = transcriptEl.children('p')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(t => t.length > 0);

  const transcript = paragraphs.join('\n');
  assertTranscript(transcript, url);

  const speakerMap = parseSpeakerMap(transcript, speakerPattern);

  // Detect guest: any speaker who isn't Ben or David
  const guest = Object.keys(speakerMap)
    .filter(name => !hosts.has(name.toLowerCase()))
    .sort((a, b) => speakerMap[b] - speakerMap[a])
    .join(', ');

  const preDefinedChapters = buildPredefinedChapters(description, transcript);

  return {
    title,
    podcast_name: 'Acquired',
    host: 'Ben Gilbert, David Rosenthal',
    guest,
    date,
    transcript,
    speakerPattern,
    speakerMap,
    preDefinedChapters,
  };
}
