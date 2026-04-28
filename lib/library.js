// Episode cache — keyed by URL hash to ~/.podcast-summarizer/library/
import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';
import os from 'os';

export const LIBRARY_DIR = process.env.PODCAST_LIBRARY_DIR ||
  path.join(os.homedir(), '.podcast-summarizer', 'library');

export function episodeHash(url) {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

export function cacheGet(url) {
  const p = path.join(LIBRARY_DIR, `${episodeHash(url)}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function cacheSet(url, data) {
  fs.mkdirSync(LIBRARY_DIR, { recursive: true });
  const p = path.join(LIBRARY_DIR, `${episodeHash(url)}.json`);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

export function cacheExists(url) {
  return fs.existsSync(path.join(LIBRARY_DIR, `${episodeHash(url)}.json`));
}
