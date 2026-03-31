// Free-tier: episode cache hit/miss logic
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import os from 'os';

// Use a temp dir so tests don't pollute the real library
const tmpDir = join(os.tmpdir(), `podcast-lib-test-${Date.now()}`);
process.env.PODCAST_LIBRARY_DIR = tmpDir;
mkdirSync(tmpDir, { recursive: true });

// Import AFTER setting env var
const { cacheGet, cacheSet, cacheExists, episodeHash } = await import('../lib/library.js');

const TEST_URL = 'https://conversationswithtyler.com/episodes/test-episode-123';
const TEST_DATA = { title: 'Test Episode', chapters: [{ text: 'hello world' }] };

test('cache miss returns null', () => {
  assert.equal(cacheGet(TEST_URL), null);
});

test('cacheExists returns false before write', () => {
  assert.equal(cacheExists(TEST_URL), false);
});

test('cacheSet writes data', () => {
  cacheSet(TEST_URL, TEST_DATA);
  assert.equal(cacheExists(TEST_URL), true);
});

test('cacheGet returns stored data', () => {
  const result = cacheGet(TEST_URL);
  assert.deepEqual(result, TEST_DATA);
});

test('episodeHash is stable across calls', () => {
  const h1 = episodeHash(TEST_URL);
  const h2 = episodeHash(TEST_URL);
  assert.equal(h1, h2);
});

test('different URLs produce different hashes', () => {
  const h1 = episodeHash('https://example.com/ep1');
  const h2 = episodeHash('https://example.com/ep2');
  assert.notEqual(h1, h2);
});

test('episodeHash length is 16 chars', () => {
  assert.equal(episodeHash(TEST_URL).length, 16);
});

// Cleanup
process.on('exit', () => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});
