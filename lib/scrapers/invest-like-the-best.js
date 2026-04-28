// Scraper: Invest Like the Best (colossus.com / joincolossus.com)
import * as cheerio from 'cheerio';
import { fetchHtml, assertTranscript, parseSpeakerMap } from './_fetch.js';
import { gatherDescriptionText, buildPredefinedChapters } from '../native-chapters.js';

// Matches both legacy ALL_CAPS: format and new First Name format (after normalization)
export const speakerPattern = /^([A-Z][A-Z\s']{1,30}):\s*/m;

export async function scrape(url, htmlOverride) {
  const html = htmlOverride ?? await fetchHtml(url);
  return scrapeFromHtml(html, url);
}

export function scrapeFromHtml(html, url) {
  const $ = cheerio.load(html);

  // Title: prefer og:title, then h1
  const title = $('meta[property="og:title"]').attr('content') ||
                $('h1').first().text().trim() ||
                'Unknown Episode';

  // Guest: new site uses structured data; fall back to subtitle elements
  const guest = $('meta[property="article:author"]').attr('content') ||
                $('h2, .episode-subtitle, [class*="guest"]').first().text().trim() || '';

  const date = $('time').first().attr('datetime') ||
               $('time').first().text().trim() ||
               $('meta[property="article:published_time"]').attr('content') ||
               '';

  // --- New Colossus format: transcript__content with <span class="transcript__speaker"> ---
  const newTranscriptEl = $('div.transcript__content, .transcript__content');
  if (newTranscriptEl.length) {
    const transcript = extractNewFormat($, newTranscriptEl);
    assertTranscript(transcript, url);
    const speakerMap = parseSpeakerMap(transcript, speakerPattern);
    const preDefinedChapters = buildPredefinedChapters(gatherDescriptionText($), transcript);
    return {
      title: cleanTitle(title),
      podcast_name: 'Invest Like the Best',
      host: "Patrick O'Shaughnessy",
      guest: cleanGuest(guest, title),
      date,
      transcript,
      speakerPattern,
      speakerMap,
      preDefinedChapters,
    };
  }

  // --- Legacy format: .content-body with ALL_CAPS: speaker labels ---
  let transcriptEl = $('[class*="transcript"], .episode-transcript, .content-body, article, main').first();
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
    title: cleanTitle(title),
    podcast_name: 'Invest Like the Best',
    host: "Patrick O'Shaughnessy",
    guest: cleanGuest(guest, title),
    date,
    transcript,
    speakerPattern,
    speakerMap,
    preDefinedChapters,
  };
}

// Extract transcript from the new Colossus DOM with <span class="transcript__speaker">
function extractNewFormat($, container) {
  const lines = [];
  container.find('p').each((_, el) => {
    const p = $(el);
    // Check for speaker span
    const speakerSpan = p.find('span.transcript__speaker');
    let line = '';
    if (speakerSpan.length) {
      const name = speakerSpan.text().trim().toUpperCase();
      // Remove the speaker span, get remaining text
      speakerSpan.remove();
      const text = p.text().trim();
      line = `${name}: ${text}`;
    } else {
      line = p.text().trim();
    }
    if (line) lines.push(line);
  });
  // Also pick up any h2 section headers as context markers
  container.find('h2').each((_, el) => {
    // These are already interleaved in DOM order via the p loop above
  });
  return lines.join('\n\n');
}

// Strip newsletter/form junk from title
function cleanTitle(raw) {
  // If title contains "I would like to receive" or "Submit" it picked up form text
  if (/I would like to receive|Submit|First Name|Last Name|Email/i.test(raw)) {
    const match = raw.match(/^(.+?)(?:First Name|Last Name|Email|\s*I would like)/i);
    return match ? match[1].trim() : raw;
  }
  return raw;
}

// Try to extract guest name from title if guest field is junk
function cleanGuest(guest, title) {
  if (/First Name|Last Name|Email|Submit|I would like/i.test(guest)) {
    return ''; // form text leaked in, discard
  }
  return guest;
}
