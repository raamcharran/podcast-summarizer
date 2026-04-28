// Free-tier: URL router tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSupportedSites } from '../lib/scrapers/index.js';

// We test the routing logic by importing the matcher directly
// scrapeEpisode itself requires network — we test error path only

test('getSupportedSites returns 8 sites', () => {
  const sites = getSupportedSites();
  assert.equal(sites.length, 8);
});

test('getSupportedSites includes expected podcast names', () => {
  const sites = getSupportedSites();
  assert.ok(sites.some(s => s.includes('Tyler')), 'includes Conversations with Tyler');
  assert.ok(sites.some(s => s.includes('Dwarkesh')), 'includes Dwarkesh');
  assert.ok(sites.some(s => s.includes('Cheeky')), 'includes Cheeky Pint');
  assert.ok(sites.some(s => s.includes('Best')), 'includes Invest Like the Best');
  assert.ok(sites.some(s => s.includes('Lex Fridman')), 'includes Lex Fridman Podcast');
  assert.ok(sites.some(s => s.includes('TBPN')), 'includes TBPN');
  assert.ok(sites.some(s => s.includes('Acquired')), 'includes Acquired');
  assert.ok(sites.some(s => s.includes('YouTube')), 'includes YouTube');
});

test('scrapeEpisode rejects unsupported URL', async () => {
  const { scrapeEpisode } = await import('../lib/scrapers/index.js');
  await assert.rejects(
    () => scrapeEpisode('https://spotify.com/episode/123'),
    /Unsupported podcast site/,
    'should reject with clear message listing supported sites'
  );
});

test('unsupported URL error message lists supported sites', async () => {
  const { scrapeEpisode } = await import('../lib/scrapers/index.js');
  try {
    await scrapeEpisode('https://example.com/episode');
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err.message.includes('Supported:'), 'error should list supported sites');
  }
});
