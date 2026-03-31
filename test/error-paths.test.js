// Free-tier: error path tests for transcript validation and speaker detection
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTranscript, parseSpeakerMap } from '../lib/scrapers/_fetch.js';

// --- assertTranscript ---

test('assertTranscript throws on transcript under 500 words', () => {
  const short = 'This is a very short transcript with only a few words.';
  assert.throws(
    () => assertTranscript(short, 'https://example.com/ep'),
    /incomplete/i,
    'should throw with incomplete message'
  );
});

test('assertTranscript error message includes word count', () => {
  const short = Array(10).fill('word').join(' ');
  try {
    assertTranscript(short, 'https://example.com/ep');
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err.message.includes('10 words') || err.message.includes('minimum 500'), 'error should mention word count or minimum');
  }
});

test('assertTranscript error message includes URL', () => {
  const short = 'too short';
  const url = 'https://example.com/episode/123';
  try {
    assertTranscript(short, url);
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err.message.includes(url), 'error message should include the URL');
  }
});

test('assertTranscript returns word count for valid transcript', () => {
  const words = Array(600).fill('word').join(' ');
  const count = assertTranscript(words, 'https://example.com/ep');
  assert.ok(count >= 600, 'should return word count');
});

test('assertTranscript does not throw on exactly 500 words', () => {
  const words = Array(500).fill('word').join(' ');
  assert.doesNotThrow(() => assertTranscript(words, 'https://example.com/ep'));
});

// --- parseSpeakerMap: no speaker labels → empty map (warn+continue, no crash) ---

test('parseSpeakerMap returns empty map when no speaker labels found', () => {
  const noLabels = 'This transcript has no speaker labels at all. Just plain text going on and on.';
  const pattern = /^([A-Z][A-Z\s']{1,30}):\s*/m;
  const map = parseSpeakerMap(noLabels, pattern);
  assert.deepEqual(map, {}, 'should return empty object, not throw');
});

test('parseSpeakerMap does not throw on empty string', () => {
  const pattern = /^([A-Z][A-Z\s']{1,30}):\s*/m;
  assert.doesNotThrow(() => parseSpeakerMap('', pattern));
});

test('parseSpeakerMap counts speaker occurrences correctly', () => {
  const transcript = 'COWEN: Hello there.\nSUNSTEIN: Hi.\nCOWEN: How are you?\nSUNSTEIN: Fine.';
  const pattern = /^([A-Z][A-Z\s']{1,30}):\s*/m;
  const map = parseSpeakerMap(transcript, pattern);
  assert.equal(map['COWEN'], 2);
  assert.equal(map['SUNSTEIN'], 2);
});

test('parseSpeakerMap handles mixed-case labels', () => {
  const transcript = 'Dwarkesh Patel: Welcome.\nDemis Hassabis: Thank you for having me.';
  const pattern = /^([A-Z][a-zA-Z\s]{1,40}):\s*/m;
  const map = parseSpeakerMap(transcript, pattern);
  assert.ok(Object.keys(map).length > 0, 'should detect mixed-case speaker labels');
});
