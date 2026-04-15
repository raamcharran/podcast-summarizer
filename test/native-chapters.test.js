// Free-tier: native chapter detection (description parsing + transcript splitting)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseChaptersFromDescription,
  splitTranscriptProportionally,
  splitSegmentsByTime,
  buildPredefinedChapters,
} from '../lib/native-chapters.js';

test('parseChaptersFromDescription — basic MM:SS format', () => {
  const desc = `
0:00 Intro
5:23 The backstory
12:45 First principles
28:10 Closing thoughts
`;
  const result = parseChaptersFromDescription(desc);
  assert.equal(result.length, 4);
  assert.equal(result[0].title, 'Intro');
  assert.equal(result[0].startSeconds, 0);
  assert.equal(result[1].startSeconds, 5 * 60 + 23);
  assert.equal(result[3].startSeconds, 28 * 60 + 10);
});

test('parseChaptersFromDescription — HH:MM:SS format with separators', () => {
  const desc = `
00:00:00 - Introduction
00:15:42 — Main discussion
01:02:30 : Wrap-up
`;
  const result = parseChaptersFromDescription(desc);
  assert.equal(result.length, 3);
  assert.equal(result[1].startSeconds, 15 * 60 + 42);
  assert.equal(result[2].startSeconds, 3600 + 2 * 60 + 30);
});

test('parseChaptersFromDescription — parenthesized timestamps', () => {
  const desc = `
(0:00) Intro
(10:30) Next chapter
`;
  const result = parseChaptersFromDescription(desc);
  assert.equal(result.length, 2);
  assert.equal(result[0].title, 'Intro');
});

test('parseChaptersFromDescription — returns null for empty input', () => {
  assert.equal(parseChaptersFromDescription(''), null);
  assert.equal(parseChaptersFromDescription(null), null);
});

test('parseChaptersFromDescription — requires at least 2 entries', () => {
  const desc = '0:00 Only one chapter';
  assert.equal(parseChaptersFromDescription(desc), null);
});

test('parseChaptersFromDescription — rejects non-monotonic timestamps', () => {
  const desc = `
0:00 First
10:00 Second
5:00 Third comes back in time
`;
  assert.equal(parseChaptersFromDescription(desc), null);
});

test('parseChaptersFromDescription — ignores non-timestamp lines', () => {
  const desc = `
Show notes:
Welcome to the episode where we discuss economics.
0:00 Introduction
Some random body text here that talks about things.
15:30 Main topic
Thanks for listening!
`;
  const result = parseChaptersFromDescription(desc);
  assert.equal(result.length, 2);
  assert.equal(result[0].title, 'Introduction');
  assert.equal(result[1].title, 'Main topic');
});

test('splitTranscriptProportionally — splits by relative time', () => {
  const transcript = 'A'.repeat(100) + '\n' + 'B'.repeat(100) + '\n' + 'C'.repeat(100);
  const chapters = [
    { title: 'First', startSeconds: 0 },
    { title: 'Second', startSeconds: 100 },
    { title: 'Third', startSeconds: 200 },
  ];
  const result = splitTranscriptProportionally(transcript, chapters);
  assert.equal(result.length, 3);
  // Each slice should be non-empty
  for (const s of result) assert.ok(s.length > 0, 'slice should be non-empty');
});

test('splitTranscriptProportionally — single chapter returns whole transcript', () => {
  const result = splitTranscriptProportionally('hello world', [{ title: 'x', startSeconds: 0 }]);
  assert.equal(result[0], 'hello world');
});

test('splitSegmentsByTime — assigns segments to correct chapter', () => {
  const segments = [
    { startSeconds: 0, text: 'alpha' },
    { startSeconds: 30, text: 'beta' },
    { startSeconds: 120, text: 'gamma' },
    { startSeconds: 200, text: 'delta' },
  ];
  const chapters = [
    { title: 'One', startSeconds: 0 },
    { title: 'Two', startSeconds: 100 },
    { title: 'Three', startSeconds: 180 },
  ];
  const result = splitSegmentsByTime(segments, chapters);
  assert.equal(result.length, 3);
  assert.equal(result[0], 'alpha beta');
  assert.equal(result[1], 'gamma');
  assert.equal(result[2], 'delta');
});

test('buildPredefinedChapters — end-to-end from description and transcript', () => {
  const description = `
0:00 Intro
1:00 Middle
2:00 End
`;
  const transcript = 'A'.repeat(300);
  const result = buildPredefinedChapters(description, transcript);
  assert.equal(result.length, 3);
  assert.equal(result[0].title, 'Intro');
  assert.equal(result[0].speakerMap && typeof result[0].speakerMap, 'object');
  for (const ch of result) assert.ok(ch.text.length > 0);
});

test('buildPredefinedChapters — returns null when no chapters in description', () => {
  const result = buildPredefinedChapters('Just some text with no timestamps.', 'transcript body');
  assert.equal(result, null);
});
