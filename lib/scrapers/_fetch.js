// Shared HTTP fetch with retry for scrapers
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

async function fetchHtmlWithCurl(url) {
  const { stdout } = await execFileAsync('curl', [
    '-s', '-L', '--max-time', String(TIMEOUT_MS / 1000),
    '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    '-H', 'Accept-Language: en-US,en;q=0.5',
    '--fail',
    url,
  ], { maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

export async function fetchHtml(url) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });
      clearTimeout(id);
      if (!res.ok) {
        // Cloudflare and similar WAFs block Node.js TLS fingerprints — fall back to curl
        if (res.status === 403) {
          return await fetchHtmlWithCurl(url);
        }
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// Parse speaker labels from transcript text.
// Returns a map of LABEL -> count, e.g. { COWEN: 42, SUNSTEIN: 31 }
export function parseSpeakerMap(transcript, speakerPattern) {
  const map = {};
  const re = new RegExp(speakerPattern.source, 'gm');
  let m;
  while ((m = re.exec(transcript)) !== null) {
    const label = m[1].trim();
    map[label] = (map[label] || 0) + 1;
  }
  return map;
}

// Strip speaker labels from transcript text for cleaner LLM input
export function cleanTranscript(transcript, speakerPattern) {
  return transcript.replace(new RegExp(speakerPattern.source, 'gm'), '\n$1: ');
}

export function assertTranscript(transcript, url) {
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  if (words < 500) {
    throw new Error(
      `Transcript appears incomplete (${words} words, minimum 500).\nURL: ${url}`
    );
  }
  if (words > 40_000) {
    console.warn(`[warn] Long transcript: ${words} words. Processing will take longer.`);
  }
  return words;
}
