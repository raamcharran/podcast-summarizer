// Free-tier: scraper tests against saved HTML fixtures
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { scrapeFromHtml as scrapeCWT } from '../lib/scrapers/conversations-with-tyler.js';
import { scrapeFromHtml as scrapeDwarkesh } from '../lib/scrapers/dwarkesh.js';
import { scrapeFromHtml as scrapeCheekyPint } from '../lib/scrapers/cheeky-pint.js';
import { scrapeFromHtml as scrapeILTB } from '../lib/scrapers/invest-like-the-best.js';
import { scrapeFromHtml as scrapeLexFridman } from '../lib/scrapers/lex-fridman.js';
import { scrapeFromHtml as scrapeTBPN } from '../lib/scrapers/tbpn.js';
import { scrapeFromHtml as scrapeAcquired } from '../lib/scrapers/acquired.js';
import { scrapeFromHtml as scrapeYouTube, extractVideoId, extractGuestFromTitle, formatRawTranscript } from '../lib/scrapers/youtube.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = name => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

const CWT_URL = 'https://conversationswithtyler.com/episodes/cass-sunstein';
const DWARKESH_URL = 'https://dwarkeshpatel.com/demis-hassabis';
const CHEEKY_URL = 'https://cheekypint.com/episodes/energy';
const ILTB_URL = 'https://joincolossus.com/episodes/charlie-munger';
const LEX_URL = 'https://lexfridman.com/jensen-huang-transcript';
const TBPN_URL = 'https://open.spotify.com/episode/tbpn-march-25-2026';
const ACQUIRED_URL = 'https://www.acquired.fm/episodes/formula-1';
const YT_URL = 'https://www.youtube.com/watch?v=abc123xyz99';

test('CWT scraper — extracts transcript', () => {
  const result = scrapeCWT(fixture('cwt-episode.html'), CWT_URL);
  assert.ok(result.transcript.length > 100, 'transcript should be non-empty');
  assert.ok(result.transcript.split(/\s+/).length >= 500, 'transcript should have 500+ words');
});

test('CWT scraper — extracts title', () => {
  const result = scrapeCWT(fixture('cwt-episode.html'), CWT_URL);
  assert.ok(result.title.length > 0, 'title should be present');
});

test('CWT scraper — extracts guest', () => {
  const result = scrapeCWT(fixture('cwt-episode.html'), CWT_URL);
  assert.ok(result.guest.length > 0, 'guest should be present');
});

test('CWT scraper — detects speaker pattern', () => {
  const result = scrapeCWT(fixture('cwt-episode.html'), CWT_URL);
  assert.ok(result.speakerPattern instanceof RegExp, 'speakerPattern should be a RegExp');
  assert.ok(result.speakerPattern.test('COWEN: Hello'), 'pattern should match COWEN:');
});

test('CWT scraper — builds speaker map', () => {
  const result = scrapeCWT(fixture('cwt-episode.html'), CWT_URL);
  assert.ok(typeof result.speakerMap === 'object', 'speakerMap should be an object');
  assert.ok(Object.keys(result.speakerMap).length > 0, 'speakerMap should have entries');
});

test('CWT scraper — returns podcast_name', () => {
  const result = scrapeCWT(fixture('cwt-episode.html'), CWT_URL);
  assert.equal(result.podcast_name, 'Conversations with Tyler');
});

test('Dwarkesh scraper — extracts transcript and speaker map', () => {
  const result = scrapeDwarkesh(fixture('dwarkesh-episode.html'), DWARKESH_URL);
  assert.ok(result.transcript.split(/\s+/).length >= 500, 'transcript 500+ words');
  assert.ok(result.title.length > 0, 'title present');
  assert.equal(result.podcast_name, 'Dwarkesh Podcast');
});

test('Cheeky Pint scraper — extracts transcript', () => {
  const result = scrapeCheekyPint(fixture('cheeky-pint-episode.html'), CHEEKY_URL);
  assert.ok(result.transcript.split(/\s+/).length >= 500, 'transcript 500+ words');
  assert.equal(result.podcast_name, 'Cheeky Pint');
});

test('ILTB scraper — extracts transcript and speaker map', () => {
  const result = scrapeILTB(fixture('iltb-episode.html'), ILTB_URL);
  assert.ok(result.transcript.split(/\s+/).length >= 500, 'transcript 500+ words');
  assert.equal(result.podcast_name, 'Invest Like the Best');
});

test('CWT scraper — throws on missing transcript element', () => {
  const badHtml = '<html><body><h1>Title</h1><p>no transcript here</p></body></html>';
  assert.throws(
    () => scrapeCWT(badHtml, CWT_URL),
    /Transcript not found/,
    'should throw with clear message'
  );
});

test('CWT scraper — throws on transcript under 500 words', () => {
  const shortHtml = '<html><body><h1>Title</h1><div class="transcript">Too short.</div></body></html>';
  assert.throws(
    () => scrapeCWT(shortHtml, CWT_URL),
    /incomplete/i,
    'should throw with incomplete message'
  );
});

test('Lex Fridman scraper — extracts transcript', () => {
  const result = scrapeLexFridman(fixture('lex-fridman-episode.html'), LEX_URL);
  assert.ok(result.transcript.split(/\s+/).length >= 500, 'transcript 500+ words');
});

test('Lex Fridman scraper — extracts title without "Transcript for" prefix', () => {
  const result = scrapeLexFridman(fixture('lex-fridman-episode.html'), LEX_URL);
  assert.ok(result.title.length > 0, 'title should be present');
  assert.ok(!result.title.startsWith('Transcript for'), 'title should not start with "Transcript for"');
});

test('Lex Fridman scraper — extracts guest from title', () => {
  const result = scrapeLexFridman(fixture('lex-fridman-episode.html'), LEX_URL);
  assert.ok(result.guest.length > 0, 'guest should be present');
  assert.ok(result.guest.includes('Jensen'), 'guest should include Jensen');
});

test('Lex Fridman scraper — identifies both speakers', () => {
  const result = scrapeLexFridman(fixture('lex-fridman-episode.html'), LEX_URL);
  assert.equal(result.host, 'Lex Fridman');
  assert.equal(result.podcast_name, 'Lex Fridman Podcast');
  assert.ok(Object.keys(result.speakerMap).length >= 2, 'should detect at least 2 speakers');
});

test('Lex Fridman scraper — transcript preserves speaker labels', () => {
  const result = scrapeLexFridman(fixture('lex-fridman-episode.html'), LEX_URL);
  assert.ok(result.transcript.includes('Lex Fridman:'), 'transcript should include Lex Fridman speaker label');
  assert.ok(result.transcript.includes('Jensen Huang:'), 'transcript should include Jensen Huang speaker label');
});

test('Lex Fridman scraper — throws on missing ts-segment elements', () => {
  const badHtml = '<html><body><h1>Lex Fridman</h1><p>no transcript here</p></body></html>';
  assert.throws(
    () => scrapeLexFridman(badHtml, LEX_URL),
    /Transcript not found/,
    'should throw with clear message'
  );
});

test('TBPN scraper — extracts transcript', () => {
  const result = scrapeTBPN(fixture('tbpn-episode.html'), TBPN_URL);
  assert.ok(result.transcript.split(/\s+/).length >= 500, 'transcript 500+ words');
});

test('TBPN scraper — extracts title from og:title', () => {
  const result = scrapeTBPN(fixture('tbpn-episode.html'), TBPN_URL);
  assert.ok(result.title.includes('Tech Headlines'), 'title should contain episode name');
});

test('TBPN scraper — extracts podcast_name from page title', () => {
  const result = scrapeTBPN(fixture('tbpn-episode.html'), TBPN_URL);
  assert.equal(result.podcast_name, 'TBPN');
});

test('TBPN scraper — detects speaker pattern', () => {
  const result = scrapeTBPN(fixture('tbpn-episode.html'), TBPN_URL);
  assert.ok(result.speakerPattern instanceof RegExp, 'speakerPattern should be a RegExp');
  assert.ok(result.speakerPattern.test('Speaker 1: Hello'), 'pattern should match Speaker 1:');
  assert.ok(result.speakerPattern.test('Speaker 2: Hello'), 'pattern should match Speaker 2:');
});

test('TBPN scraper — builds speaker map with multiple speakers', () => {
  const result = scrapeTBPN(fixture('tbpn-episode.html'), TBPN_URL);
  assert.ok(typeof result.speakerMap === 'object', 'speakerMap should be an object');
  assert.ok(Object.keys(result.speakerMap).length >= 2, 'should detect at least 2 speakers');
  assert.ok(result.speakerMap['Speaker 1'] > 0, 'Speaker 1 should have entries');
  assert.ok(result.speakerMap['Speaker 2'] > 0, 'Speaker 2 should have entries');
});

test('TBPN scraper — transcript preserves speaker labels', () => {
  const result = scrapeTBPN(fixture('tbpn-episode.html'), TBPN_URL);
  assert.ok(result.transcript.includes('Speaker 1:'), 'transcript should include Speaker 1 label');
  assert.ok(result.transcript.includes('Speaker 2:'), 'transcript should include Speaker 2 label');
});

test('TBPN scraper — throws on empty page', () => {
  const badHtml = '<html><body><h1>Nothing here</h1></body></html>';
  assert.throws(
    () => scrapeTBPN(badHtml, TBPN_URL),
    /Transcript not found|incomplete/i,
    'should throw with clear message'
  );
});

test('Acquired scraper — extracts transcript', () => {
  const result = scrapeAcquired(fixture('acquired-episode.html'), ACQUIRED_URL);
  assert.ok(result.transcript.split(/\s+/).length >= 500, 'transcript 500+ words');
});

test('Acquired scraper — extracts title', () => {
  const result = scrapeAcquired(fixture('acquired-episode.html'), ACQUIRED_URL);
  assert.ok(result.title.length > 0, 'title should be present');
  assert.ok(result.title.includes('Formula 1'), 'title should include Formula 1');
});

test('Acquired scraper — returns podcast_name', () => {
  const result = scrapeAcquired(fixture('acquired-episode.html'), ACQUIRED_URL);
  assert.equal(result.podcast_name, 'Acquired');
});

test('Acquired scraper — extracts date', () => {
  const result = scrapeAcquired(fixture('acquired-episode.html'), ACQUIRED_URL);
  assert.ok(result.date.length > 0, 'date should be present');
});

test('Acquired scraper — detects speaker pattern', () => {
  const result = scrapeAcquired(fixture('acquired-episode.html'), ACQUIRED_URL);
  assert.ok(result.speakerPattern instanceof RegExp, 'speakerPattern should be a RegExp');
  assert.ok(result.speakerPattern.test('David: Hello'), 'pattern should match David:');
  assert.ok(result.speakerPattern.test('Ben: Hello'), 'pattern should match Ben:');
});

test('Acquired scraper — builds speaker map with hosts', () => {
  const result = scrapeAcquired(fixture('acquired-episode.html'), ACQUIRED_URL);
  assert.ok(typeof result.speakerMap === 'object', 'speakerMap should be an object');
  assert.ok(Object.keys(result.speakerMap).length >= 2, 'should detect at least 2 speakers');
  assert.ok(result.speakerMap['David'] > 0, 'David should have entries');
  assert.ok(result.speakerMap['Ben'] > 0, 'Ben should have entries');
});

test('Acquired scraper — identifies hosts', () => {
  const result = scrapeAcquired(fixture('acquired-episode.html'), ACQUIRED_URL);
  assert.equal(result.host, 'Ben Gilbert, David Rosenthal');
});

test('Acquired scraper — throws on missing transcript', () => {
  const badHtml = '<html><body><h1>Acquired</h1><p>no transcript here</p></body></html>';
  assert.throws(
    () => scrapeAcquired(badHtml, ACQUIRED_URL),
    /Transcript not found/,
    'should throw with clear message'
  );
});

// --- YouTube scraper ---

test('YouTube scraper — extracts transcript', () => {
  const result = scrapeYouTube(fixture('youtube-episode.html'), YT_URL);
  assert.ok(result.transcript.split(/\s+/).length >= 500, 'transcript 500+ words');
});

test('YouTube scraper — extracts title from og:title', () => {
  const result = scrapeYouTube(fixture('youtube-episode.html'), YT_URL);
  assert.ok(result.title.includes('Jensen Huang'), 'title should include Jensen Huang');
  assert.ok(result.title.includes('NVIDIA'), 'title should include NVIDIA');
});

test('YouTube scraper — returns podcast_name', () => {
  const result = scrapeYouTube(fixture('youtube-episode.html'), YT_URL);
  assert.equal(result.podcast_name, 'YouTube');
});

test('YouTube scraper — extracts host (channel name)', () => {
  const result = scrapeYouTube(fixture('youtube-episode.html'), YT_URL);
  assert.equal(result.host, 'Lex Clips');
});

test('YouTube scraper — extracts guest from title', () => {
  const result = scrapeYouTube(fixture('youtube-episode.html'), YT_URL);
  assert.ok(result.guest.includes('Jensen Huang'), 'guest should include Jensen Huang');
});

test('YouTube scraper — extracts date', () => {
  const result = scrapeYouTube(fixture('youtube-episode.html'), YT_URL);
  assert.equal(result.date, '2024-06-15');
});

test('YouTube scraper — detects speaker pattern', () => {
  const result = scrapeYouTube(fixture('youtube-episode.html'), YT_URL);
  assert.ok(result.speakerPattern instanceof RegExp, 'speakerPattern should be a RegExp');
  assert.ok(result.speakerPattern.test('Lex Fridman: Hello'), 'pattern should match Lex Fridman:');
});

test('YouTube scraper — builds speaker map with both speakers', () => {
  const result = scrapeYouTube(fixture('youtube-episode.html'), YT_URL);
  assert.ok(typeof result.speakerMap === 'object', 'speakerMap should be an object');
  assert.ok(Object.keys(result.speakerMap).length >= 2, 'should detect at least 2 speakers');
  assert.ok(result.speakerMap['Lex Fridman'] > 0, 'Lex Fridman should have entries');
  assert.ok(result.speakerMap['Jensen Huang'] > 0, 'Jensen Huang should have entries');
});

test('YouTube scraper — transcript preserves speaker labels', () => {
  const result = scrapeYouTube(fixture('youtube-episode.html'), YT_URL);
  assert.ok(result.transcript.includes('Lex Fridman:'), 'transcript should include Lex Fridman label');
  assert.ok(result.transcript.includes('Jensen Huang:'), 'transcript should include Jensen Huang label');
});

test('YouTube scraper — throws on missing transcript', () => {
  const badHtml = '<html><body><h1>Video</h1><p>no transcript here</p></body></html>';
  assert.throws(
    () => scrapeYouTube(badHtml, YT_URL),
    /Transcript not found/,
    'should throw with clear message'
  );
});

// --- YouTube utility functions ---

test('extractVideoId — standard watch URL', () => {
  assert.equal(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('extractVideoId — short URL', () => {
  assert.equal(extractVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('extractVideoId — live URL', () => {
  assert.equal(extractVideoId('https://www.youtube.com/live/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('extractVideoId — embed URL', () => {
  assert.equal(extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('extractVideoId — throws on invalid URL', () => {
  assert.throws(() => extractVideoId('https://example.com/video'), /Could not extract/);
});

test('extractGuestFromTitle — "Name: Topic" pattern', () => {
  assert.equal(extractGuestFromTitle('Jensen Huang: NVIDIA and AI', 'Lex Clips'), 'Jensen Huang');
});

test('extractGuestFromTitle — "Name | Topic" pattern', () => {
  assert.equal(extractGuestFromTitle('Jensen Huang | Future of GPUs', 'Lex Clips'), 'Jensen Huang');
});

test('extractGuestFromTitle — "with Name" pattern', () => {
  assert.equal(extractGuestFromTitle('The Future of AI with Jensen Huang', 'Lex Clips'), 'Jensen Huang');
});

test('extractGuestFromTitle — does not return channel name as guest', () => {
  assert.equal(extractGuestFromTitle('Lex Clips: Best Moments', 'Lex Clips'), '');
});

test('formatRawTranscript — joins segments', () => {
  const segments = [
    { text: 'Hello everyone', duration: 3, offset: 0 },
    { text: 'welcome to the show', duration: 2, offset: 3 },
  ];
  assert.equal(formatRawTranscript(segments), 'Hello everyone welcome to the show');
});

test('formatRawTranscript — handles string segments', () => {
  assert.equal(formatRawTranscript(['Hello', 'world']), 'Hello world');
});

test('formatRawTranscript — collapses whitespace', () => {
  const segments = [{ text: '  Hello  ', duration: 1, offset: 0 }, { text: '  world  ', duration: 1, offset: 1 }];
  assert.equal(formatRawTranscript(segments), 'Hello world');
});
