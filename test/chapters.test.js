// Free-tier: chapter anchor lookup and fallback logic
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Extract the pure anchor-resolution logic for unit testing
// by duplicating the small helper (no LLM calls needed)

function findAnchorPosition(transcript, startQuote, fallbackIndex, total) {
  const pos = transcript.indexOf(startQuote);
  if (pos !== -1) return pos;
  const shortQuote = startQuote.split(/\s+/).slice(0, 6).join(' ');
  const fuzzyPos = transcript.indexOf(shortQuote);
  if (fuzzyPos !== -1) return fuzzyPos;
  return Math.floor((fallbackIndex / total) * transcript.length);
}

const TRANSCRIPT = 'First let me say that economics matters a lot. Then we discuss how markets work. Finally we explore the role of government in shaping outcomes.';

test('anchor lookup — exact match', () => {
  const pos = findAnchorPosition(TRANSCRIPT, 'First let me say that economics matters', 0, 3);
  assert.equal(pos, 0);
});

test('anchor lookup — fuzzy match on first 6 words', () => {
  // Slightly modified quote — first 6 words still match
  const pos = findAnchorPosition(TRANSCRIPT, 'Then we discuss how markets work today', 1, 3);
  assert.ok(pos > 0, 'fuzzy match should find a position after the start');
  assert.ok(pos < TRANSCRIPT.length / 2, 'should find position in second third');
});

test('anchor lookup — proportional fallback when no match', () => {
  const pos = findAnchorPosition(TRANSCRIPT, 'completely missing quote xyz', 2, 3);
  // Fallback: index 2 / total 3 * length ≈ 2/3 through
  const expected = Math.floor((2 / 3) * TRANSCRIPT.length);
  assert.equal(pos, expected);
});

test('anchor lookup — proportional fallback index 0 gives position 0', () => {
  const pos = findAnchorPosition('some text here', 'not found at all ever', 0, 4);
  assert.equal(pos, 0);
});

test('anchor lookup — first chapter starts at beginning', () => {
  const pos = findAnchorPosition(TRANSCRIPT, TRANSCRIPT.slice(0, 20), 0, 3);
  assert.equal(pos, 0);
});
