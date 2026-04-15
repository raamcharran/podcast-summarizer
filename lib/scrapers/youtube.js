// Scraper: YouTube (youtube.com, youtu.be)
// Live path uses youtube-transcript API for captions + oEmbed for metadata.
// Fixture path (scrapeFromHtml) parses metadata from meta tags and transcript from segment elements.
import * as cheerio from 'cheerio';
import { assertTranscript, parseSpeakerMap } from './_fetch.js';
import { generateText, getAiConfig } from '../ai.js';
import { parseChaptersFromDescription } from '../native-chapters.js';

export const speakerPattern = /^([A-Z][a-zA-Z\s']{1,40}):\s*/m;

const VIDEO_ID_RE = /(?:youtube\.com\/(?:watch\?.*v=|live\/|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function extractVideoId(url) {
  const m = url.match(VIDEO_ID_RE);
  if (!m) throw new Error(`Could not extract YouTube video ID from URL: ${url}`);
  return m[1];
}

export function extractGuestFromTitle(title, channelName = '') {
  const patterns = [
    /(?:with|ft\.?|feat\.?|featuring)\s+(.+?)(?:\s*[-|:]|$)/i,
    /^(.+?)\s*[-|:]\s*/,
  ];
  for (const re of patterns) {
    const m = title.match(re);
    if (m) {
      const name = m[1].trim();
      if (name.toLowerCase() !== channelName.toLowerCase() && name.length > 1 && name.length < 60) {
        return name;
      }
    }
  }
  return '';
}

export function formatRawTranscript(segments) {
  return segments
    .map(s => (typeof s === 'string' ? s : s.text || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchOembed(videoId) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`YouTube oEmbed failed: HTTP ${res.status}`);
  return res.json();
}

// Shorten verbose YouTube chapter titles (e.g. full-paragraph guest descriptions).
// If the title is short enough (<= 80 chars), keep it. Otherwise truncate at the
// first natural break (comma, period, em-dash) to extract the key phrase or name.
function cleanChapterTitle(raw) {
  if (raw.length <= 80) return raw;
  // Try to cut at first comma, period, or em-dash
  const breakMatch = raw.match(/^(.{3,80}?)[,.\u2014]/);
  if (breakMatch) return breakMatch[1].trim();
  // Fallback: first 80 chars at a word boundary
  const truncated = raw.slice(0, 80).replace(/\s+\S*$/, '');
  return truncated || raw.slice(0, 80);
}

// Extract chapter markers from YouTube's ytInitialData (embedded in the watch page HTML).
// Falls back to parsing `HH:MM Title` lines from the video description.
async function fetchYouTubeChapters(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const match = html.match(/var ytInitialData = ({.*?});<\/script>/s);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        const panels = data?.engagementPanels;
        if (panels) {
          for (const p of panels) {
            const macro = p?.engagementPanelSectionListRenderer?.content?.macroMarkersListRenderer;
            if (!macro?.contents) continue;
            const chapters = [];
            for (const ch of macro.contents) {
              const mr = ch.macroMarkersListItemRenderer;
              if (!mr) continue;
              const title = mr.title?.simpleText || mr.title?.runs?.map(r => r.text).join('') || '';
              const timeSec = Number(mr.onTap?.watchEndpoint?.startTimeSeconds ?? 0);
              if (title) chapters.push({ title: cleanChapterTitle(title), startSeconds: timeSec });
            }
            if (chapters.length >= 2) return chapters;
          }
        }
      } catch {
        // fall through to description parsing
      }
    }

    // Fallback: parse timestamps from the video description in ytInitialPlayerResponse.
    const prMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});\s*(?:var|<\/script>)/s);
    if (prMatch) {
      try {
        const pr = JSON.parse(prMatch[1]);
        const desc = pr?.videoDetails?.shortDescription || '';
        const fromDesc = parseChaptersFromDescription(desc);
        if (fromDesc) {
          console.log(`  Parsed ${fromDesc.length} chapters from video description.`);
          return fromDesc;
        }
      } catch {
        // ignore
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchTranscriptSegments(videoId) {
  // Import ESM build directly — the package's "main" points to CJS which breaks under "type":"module"
  const { YoutubeTranscript } = await import('youtube-transcript/dist/youtube-transcript.esm.js');
  const segments = await YoutubeTranscript.fetchTranscript(videoId);
  if (!segments?.length) {
    throw new Error(
      'No captions found for this YouTube video. The video may not have captions enabled.'
    );
  }
  return segments;
}

// Attempt LLM-based speaker diarization for conversation-style transcripts.
// Processes the first ~3K words to keep the LLM call fast and cheap.
// Remaining text is appended unlabeled — chapter detection still works.
async function diarizeSpeakers(rawTranscript, title, channelName) {
  const words = rawTranscript.split(/\s+/);
  const questionCount = (rawTranscript.match(/\?/g) || []).length;
  if (questionCount < 3 || words.length < 500) return null;

  const MAX_WORDS = 3_000;
  const inputText = words.slice(0, MAX_WORDS).join(' ');
  const remainder = words.length > MAX_WORDS ? '\n' + words.slice(MAX_WORDS).join(' ') : '';

  // Use a shorter timeout for diarization — it's optional, not worth blocking on.
  // Skip entirely for Claude CLI sessions: too slow for large transcript I/O.
  const config = { ...getAiConfig(), timeoutMs: 120_000 };
  if (config.provider === 'claude-cli') return null;
  const prompt = `Format this YouTube transcript by adding speaker labels. Video: "${title}" by ${channelName}.

Rules:
- Identify speakers from context and the video title
- Format: "Speaker Name: text" with line breaks between speaker turns
- If unsure of names, use "Host" and "Guest"
- Preserve original text verbatim — only insert speaker labels
- Output the complete labeled transcript, nothing else

Transcript:
${inputText}`;

  try {
    const result = await generateText({
      system: 'You label speaker turns in transcripts. Output only the labeled transcript.',
      prompt,
      maxTokens: 4096,
      config,
    });

    const matches = result.match(new RegExp(speakerPattern.source, 'gm'));
    if (matches && matches.length >= 2) {
      return remainder ? result + remainder : result;
    }
    return null;
  } catch {
    return null;
  }
}

// Split transcript segments into chapter text slices using segment offsets.
function splitByChapters(segments, ytChapters) {
  const chapterTexts = ytChapters.map(() => []);
  for (const seg of segments) {
    const segStartSec = (seg.offset || 0) / 1000;
    // Find the last chapter whose start time is <= this segment's offset
    let chIdx = 0;
    for (let i = ytChapters.length - 1; i >= 0; i--) {
      if (segStartSec >= ytChapters[i].startSeconds) { chIdx = i; break; }
    }
    const text = (typeof seg === 'string' ? seg : seg.text || '').trim();
    if (text) chapterTexts[chIdx].push(text);
  }
  return chapterTexts.map(parts => parts.join(' ').replace(/\s+/g, ' ').trim());
}

export async function scrape(url, htmlOverride) {
  if (htmlOverride) {
    return scrapeFromHtml(htmlOverride, url);
  }

  const videoId = extractVideoId(url);

  console.log(`  Fetching YouTube metadata and captions for ${videoId}…`);
  const [meta, segments, ytChapters] = await Promise.all([
    fetchOembed(videoId),
    fetchTranscriptSegments(videoId),
    fetchYouTubeChapters(videoId),
  ]);

  const rawTranscript = formatRawTranscript(segments);

  // Check if captions already have speaker labels (manual captions sometimes do)
  const existingLabels = rawTranscript.match(new RegExp(speakerPattern.source, 'gm'));
  let transcript;
  if (existingLabels && existingLabels.length >= 3) {
    console.log('  Captions already have speaker labels.');
    transcript = rawTranscript;
  } else {
    console.log('  Attempting speaker diarization…');
    const diarized = await diarizeSpeakers(rawTranscript, meta.title, meta.author_name);
    if (diarized) {
      console.log('  Speaker labels added via LLM.');
      transcript = diarized;
    } else {
      console.log('  Proceeding without speaker labels.');
      transcript = rawTranscript;
    }
  }

  assertTranscript(transcript, url);
  const speakerMap = parseSpeakerMap(transcript, speakerPattern);
  const guest = extractGuestFromTitle(meta.title, meta.author_name);

  // Build pre-defined chapters from YouTube chapter markers if available
  let preDefinedChapters = null;
  if (ytChapters && ytChapters.length >= 2) {
    console.log(`  YouTube chapters found: ${ytChapters.length}`);
    const chapterTexts = splitByChapters(segments, ytChapters);
    preDefinedChapters = ytChapters.map((ch, i) => ({
      title: ch.title,
      text: chapterTexts[i] || '',
      speakerMap: {},
    })).filter(ch => ch.text.length > 0);
  }

  return {
    title: meta.title,
    podcast_name: 'YouTube',
    host: meta.author_name,
    guest,
    date: '',
    episodeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    transcript,
    speakerPattern,
    speakerMap,
    preDefinedChapters,
  };
}

// Fixture/HTML path — parses metadata from meta tags and transcript from segment elements.
export function scrapeFromHtml(html, url) {
  const $ = cheerio.load(html);

  const title = $('meta[property="og:title"]').attr('content') ||
                $('meta[name="title"]').attr('content') ||
                $('title').text().replace(/\s*-\s*YouTube\s*$/, '').trim() ||
                'Unknown Video';

  const channelName = $('link[itemprop="name"]').attr('content') ||
                      $('meta[name="author"]').attr('content') ||
                      '';

  const date = $('meta[itemprop="uploadDate"]').attr('content') ||
               $('meta[itemprop="datePublished"]').attr('content') ||
               '';

  // Try transcript from segment elements (YouTube transcript panel structure)
  const segments = [];
  $('.segment-text, .transcript-segment').each((_, el) => {
    const text = $(el).text().trim();
    if (text) segments.push(text);
  });

  // Fallback: transcript in a text block
  if (!segments.length) {
    const textBlock = $('#transcript-text, .transcript-body').text().trim();
    if (textBlock) segments.push(textBlock);
  }

  if (!segments.length) {
    throw new Error(
      'Transcript not found in HTML. YouTube transcripts require captions — ensure the video has captions enabled.'
    );
  }

  const transcript = segments.join('\n');
  assertTranscript(transcript, url);

  const speakerMap = parseSpeakerMap(transcript, speakerPattern);
  const guest = extractGuestFromTitle(title, channelName);

  return {
    title,
    podcast_name: 'YouTube',
    host: channelName,
    guest,
    date,
    episodeUrl: url,
    transcript,
    speakerPattern,
    speakerMap,
  };
}
