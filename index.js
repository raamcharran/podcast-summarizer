#!/usr/bin/env node
// podcast-summarizer — CLI entry point
// Usage: node index.js <episode-url> [--debug-scrape] [--no-cache] [--out ./output]
//        node index.js --json <file.json> [--no-cache] [--out ./output]

import fs from 'fs';
import path from 'path';
import { scrapeEpisode } from './lib/scrapers/index.js';
import { detectChapters } from './lib/chapters.js';
import { enrichChapters, synthesizeEpisode } from './lib/analyze.js';
import { generateInfographics } from './lib/infographic.js';
import { runCriticLoop } from './lib/critic.js';
import { runQualityGate } from './lib/eval.js';
import { buildIndex } from './lib/rag.js';
import { assembleHtml } from './lib/html.js';
import { buildMarkdown } from './lib/markdown.js';
import { cacheGet, cacheSet, cacheExists } from './lib/library.js';
import { createLogger } from './lib/logger.js';
import { getAiConfig, describeAiConfig } from './lib/ai.js';
import { slugify } from './lib/util.js';

// Parse CLI args
const args = process.argv.slice(2);
const url = args.find(a => a.startsWith('http'));
const debugScrape = args.includes('--debug-scrape');
const noCache = args.includes('--no-cache');
const regenSynthesis = args.includes('--regen-synthesis');
const htmlIdx = args.indexOf('--html');
const htmlFile = htmlIdx !== -1 ? args[htmlIdx + 1] : null;
const jsonIdx = args.indexOf('--json');
const jsonFile = jsonIdx !== -1 ? args[jsonIdx + 1] : null;
const outIdx = args.indexOf('--out');
const outputDir = outIdx !== -1 ? args[outIdx + 1] : 'output';

if (!url && !jsonFile) {
  console.error('Usage: node index.js <episode-url> [--debug-scrape] [--no-cache] [--out ./output]');
  console.error('       node index.js --json <file.json> [--no-cache] [--out ./output]');
  process.exit(1);
}

// Resolve effective URL for JSON input
const effectiveUrl = url || (jsonFile ? (() => {
  const j = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  return j.sourceUrl || `local://${path.basename(jsonFile, '.json')}`;
})() : null);

const config = getAiConfig();
console.log(`\npodcast-summarizer`);
console.log(`  URL:      ${effectiveUrl}`);
console.log(`  Provider: ${describeAiConfig(config)}`);
console.log(`  Output:   ${outputDir}\n`);

async function run() {
  let episodeMeta;
  let preDefinedChapters = null;

  if (jsonFile) {
    // JSON input mode — load episodeMeta and optional pre-defined chapters from file
    console.log('[1/7] Loading transcript from JSON…');
    const input = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    episodeMeta = {
      title: input.title || 'Unknown Episode',
      podcast_name: input.podcast_name || '',
      host: input.host || '',
      guest: input.guest || '',
      date: input.date || '',
      transcript: input.transcript,
      speakerMap: input.speakerMap || {},
      sourceUrl: input.sourceUrl || effectiveUrl,
      episodeUrl: input.episodeUrl || input.sourceUrl || effectiveUrl,
    };
    if (input.chapters && Array.isArray(input.chapters) && input.chapters.length >= 2) {
      preDefinedChapters = input.chapters;
      console.log(`  Pre-defined chapters: ${preDefinedChapters.length}`);
    }
  } else {
    // Step 1: Scrape
    console.log('[1/7] Scraping transcript…');
    const htmlOverride = htmlFile ? fs.readFileSync(htmlFile, 'utf8') : null;
    try {
      episodeMeta = await scrapeEpisode(effectiveUrl, htmlOverride);
    } catch (err) {
      console.error(`\nError: ${err.message}`);
      process.exit(1);
    }

    // Scrapers may return pre-defined chapters (e.g. YouTube chapter markers)
    if (episodeMeta.preDefinedChapters && episodeMeta.preDefinedChapters.length >= 2) {
      preDefinedChapters = episodeMeta.preDefinedChapters;
      console.log(`  Pre-defined chapters from scraper: ${preDefinedChapters.length}`);
    }

    if (debugScrape) {
      console.log('\n--- DEBUG SCRAPE ---');
      console.log('Title:', episodeMeta.title);
      console.log('Guest:', episodeMeta.guest);
      console.log('Speaker map:', episodeMeta.speakerMap);
      console.log('Transcript (first 500 chars):', episodeMeta.transcript.slice(0, 500));
      if (preDefinedChapters) console.log('Pre-defined chapters:', preDefinedChapters.length);
      console.log('--- END DEBUG ---\n');
    }
  }

  episodeMeta.sourceUrl = effectiveUrl;

  if (!episodeMeta.speakerMap || !Object.keys(episodeMeta.speakerMap).length) {
    console.warn('  [warn] No speaker labels detected — attribution unavailable.');
  }

  const slug = slugify(episodeMeta.title, episodeMeta.guest || '');
  const logger = createLogger(slug, outputDir);
  logger.step('scrape', { title: episodeMeta.title, guest: episodeMeta.guest });

  // Step 2: Cache check
  console.log('[2/7] Checking episode cache…');
  if (!noCache && cacheExists(effectiveUrl)) {
    if (regenSynthesis) {
      console.log('  Cache HIT — re-synthesising knowledge graph only…');
      const cached = cacheGet(effectiveUrl);
      const synthesis = await synthesizeEpisode(cached.chapters, cached.analyses, episodeMeta, config, logger);
      const updated = { ...cached, synthesis };
      cacheSet(effectiveUrl, updated);
      await renderOutputs(updated, slug, outputDir, logger, effectiveUrl);
      return;
    }
    console.log('  Cache HIT — loading from library…');
    const cached = cacheGet(effectiveUrl);
    logger.step('cache_hit', { slug });
    await renderOutputs(cached, slug, outputDir, logger, effectiveUrl);
    return;
  }
  logger.step('cache_miss');

  // Step 3: Chapter detection (or use pre-defined chapters from JSON)
  let chapters;
  if (preDefinedChapters) {
    console.log('[3/7] Using pre-defined chapters…');
    chapters = preDefinedChapters.map((ch, i) => {
      const id = `ch-${i + 1}-${(ch.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`;
      return { id, title: ch.title, text: ch.text, speakerMap: ch.speakerMap || {} };
    });
    logger.step('chapters_predefined', { count: chapters.length });
  } else {
    console.log('[3/7] Detecting chapters…');
    chapters = await detectChapters(
      episodeMeta.transcript,
      episodeMeta.speakerMap,
      config,
      logger
    );
  }
  console.log(`  Found ${chapters.length} chapters.`);

  // Attach episode meta to chapters for critic re-gen context
  for (const ch of chapters) ch._episodeMeta = episodeMeta;

  // Step 4: Chapter enrichment
  console.log(`[4/7] Enriching ${chapters.length} chapters…`);
  let analyses = await enrichChapters(chapters, episodeMeta, config, logger);

  // Step 5: Critic loop (per chapter)
  console.log('[5/7] Running critic loop…');
  const criticResults = await Promise.all(
    chapters.map((ch, i) =>
      runCriticLoop(ch, analyses[i], config, logger).then(r => {
        if (r.retries > 0) {
          const quality = r.lowQuality ? ' [low quality — accepted after max retries]' : '';
          console.log(`  Chapter ${i + 1}: ${r.retries} retry/retries${quality}`);
        }
        return r.analysis;
      })
    )
  );
  analyses = criticResults;

  // Step 6: Infographics (LLM-generated SVG per chapter)
  console.log('[6/8] Generating chapter infographics…');
  const infographics = await generateInfographics(chapters, analyses, config, logger);
  const infoDone = infographics.filter(Boolean).length;
  console.log(`  Generated ${infoDone}/${chapters.length} infographics.`);

  // Step 7: Synthesis (knowledge graph + episode thesis)
  console.log('[7/8] Synthesising knowledge graph…');
  const synthesis = await synthesizeEpisode(chapters, analyses, episodeMeta, config, logger);

  // Quality gate — re-gen weakest chapters if any dimension < 3/5
  const gateResult = runQualityGate(chapters, analyses, synthesis, logger);
  if (!gateResult.pass && gateResult.weakChapters.length) {
    console.log(`  Quality gate: re-generating ${gateResult.weakChapters.length} weak chapter(s)…`);
    const weakChapters = gateResult.weakChapters.map(i => chapters[i]);
    const regenAnalyses = await enrichChapters(weakChapters, episodeMeta, config, logger);
    for (let k = 0; k < gateResult.weakChapters.length; k++) {
      if (regenAnalyses[k]) analyses[gateResult.weakChapters[k]] = regenAnalyses[k];
    }
  }

  // Step 8: Render + RAG index + cache
  console.log('[8/8] Rendering output…');
  const result = { episodeMeta, chapters, analyses, synthesis, infographics };
  cacheSet(effectiveUrl, result);
  await renderOutputs(result, slug, outputDir, logger, effectiveUrl);
}

async function renderOutputs({ episodeMeta, chapters, analyses, synthesis, infographics }, slug, outputDir, logger, url) {
  fs.mkdirSync(outputDir, { recursive: true });

  // Always inject source URL (may be missing from older cache entries)
  episodeMeta.sourceUrl = url;
  if (!episodeMeta.episodeUrl) {
    // Lex Fridman: derive episode URL by stripping -transcript suffix
    episodeMeta.episodeUrl = url.replace(/-transcript\/?$/, '');
  }

  // RAG index sidecar
  const ragIndex = buildIndex(chapters.map((ch, i) => ({
    title: ch.title,
    text: ch.text,
  })));
  const ragPath = path.join(outputDir, `${slug}.rag.json`);
  fs.writeFileSync(ragPath, JSON.stringify(ragIndex), 'utf8');

  // HTML — RAG index embedded inline (self-contained, works on file://)
  const html = assembleHtml(episodeMeta, chapters, analyses, synthesis, ragIndex, infographics || []);
  const htmlPath = path.join(outputDir, `${slug}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  // Markdown export
  const md = buildMarkdown({ ...episodeMeta, episode_thesis: synthesis.episode_thesis }, chapters, analyses);
  const mdPath = path.join(outputDir, `${slug}.md`);
  fs.writeFileSync(mdPath, md, 'utf8');

  // Run log
  logger.step('render_done', {
    output: `${slug}.html`,
    rag: `${slug}.rag.json`,
    md: `${slug}.md`,
  });
  const logPath = logger.write(url);

  console.log(`\n✓ Done!`);
  console.log(`  HTML:     ${htmlPath}`);
  console.log(`  Markdown: ${mdPath}`);
  console.log(`  RAG:      ${ragPath}`);
  console.log(`  Log:      ${logPath}\n`);
}

run().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
