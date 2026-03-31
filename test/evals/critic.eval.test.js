// Paid eval: critic loop tests using real LLM calls
// Run with: npm run test:evals
// Requires AI provider env vars (ANTHROPIC_API_KEY, OPENAI_API_KEY, or claude-cli session)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAiConfig } from '../../lib/ai.js';
import { runCriticLoop } from '../../lib/critic.js';

const config = getAiConfig();

// A chapter with realistic content — well-formed, should pass critic on first attempt
const GOOD_CHAPTER = {
  title: 'The Invisible Hand and Price Signals',
  text: `COWEN: Adam Smith's invisible hand metaphor captures something profound about how decentralized decisions coordinate economic activity without any central planner.

SUNSTEIN: Exactly. The price system aggregates information from millions of actors in a way that no central authority could replicate. Hayek called this the knowledge problem — the relevant knowledge is dispersed across society and can only be communicated through prices.

COWEN: But prices can also fail. Externalities like carbon emissions aren't priced, so the market underprovides clean air. Pigou argued for corrective taxes.

SUNSTEIN: The Pigouvian insight is powerful but implementation is fiendishly hard. You need to estimate the social cost of carbon, which involves deep uncertainty about discount rates and the valuation of future lives. The range of estimates spans an order of magnitude.

COWEN: Which suggests that even well-designed carbon taxes will be contested on technical grounds that obscure value judgments about intergenerational equity.`,
  speakerMap: { COWEN: 3, SUNSTEIN: 2 },
};

const GOOD_ANALYSIS = {
  summary:
    "Adam Smith's invisible hand coordinates decentralized decisions through price signals, embodying Hayek's knowledge problem — the insight that relevant economic knowledge is dispersed across society and can only be aggregated via prices. Markets fail when externalities like carbon emissions go unpriced, motivating Pigouvian corrective taxes. However, estimating the social cost of carbon involves deep uncertainty about discount rates and intergenerational equity, making even well-designed carbon taxes technically contested.",
  key_quote:
    "The price system aggregates information from millions of actors in a way that no central authority could replicate.",
  concept_chips: ['Invisible Hand', 'Hayek Knowledge Problem', 'Pigouvian Tax', 'Carbon Externality', 'Social Cost of Carbon'],
  insight_score: { novelty: 4, actionability: 3, specificity: 7 },
  speaker_map: {
    COWEN: 'Markets coordinate via prices but fail on externalities requiring corrective taxation',
    SUNSTEIN: 'Pigouvian taxes are sound in theory but technically contested due to discount rate uncertainty',
  },
};

// A chapter analysis that should FAIL the critic — filler summary + short quote + flat scores
const BAD_ANALYSIS = {
  summary: 'The speakers discuss economics and explore ideas about markets. They talk about various concepts and delve into the topic of prices.',
  key_quote: 'Markets are important.',
  concept_chips: ['economics', 'ideas', 'knowledge'],
  insight_score: { novelty: 5, actionability: 5, specificity: 5 },
  speaker_map: {},
};

test('critic passes good analysis on first attempt', { timeout: 60_000 }, async () => {
  const result = await runCriticLoop(GOOD_CHAPTER, GOOD_ANALYSIS, config, null);
  assert.equal(result.accepted, true);
  assert.equal(result.retries, 0, 'good analysis should pass without retries');
});

test('critic rejects bad analysis (filler summary, short quote, flat scores, empty speaker_map)', { timeout: 120_000 }, async () => {
  // Use a no-op logger to capture steps without crashing
  const log = { steps: [], warnings: [] };
  const logger = {
    step: (name, data) => log.steps.push({ name, data }),
    warn: (name, data) => log.warnings.push({ name, data }),
  };

  const result = await runCriticLoop(GOOD_CHAPTER, BAD_ANALYSIS, config, logger);

  // The critic should have detected issues and retried at least once
  assert.ok(
    result.retries > 0 || log.warnings.some(w => w.name === 'critic_max_retries'),
    'bad analysis should trigger at least one retry or exhaust max retries'
  );
  // Either the critic fixed it (accepted=true after retries) or gave up with a warning
  assert.equal(result.accepted, true, 'result should always be accepted (max retries = accept with lowQuality)');
});

test('critic returns lowQuality flag when max retries exhausted', { timeout: 180_000 }, async () => {
  // Construct a pathologically bad chapter that will likely fail all retries
  // (very sparse text — enrichChapters won't find much substance to improve)
  const sparseChapter = {
    title: 'Short Chapter',
    text: 'Things were discussed. Ideas were explored. Concepts were talked about.',
    speakerMap: { HOST: 1 },
  };

  const log = { warnings: [] };
  const logger = {
    step: () => {},
    warn: (name, data) => log.warnings.push({ name, data }),
  };

  const result = await runCriticLoop(sparseChapter, BAD_ANALYSIS, config, logger);

  // After max retries the function must still return (not throw)
  assert.equal(typeof result, 'object');
  assert.equal(result.accepted, true);
  // Verify that when retries are exhausted, lowQuality is set
  if (result.retries >= 2) {
    assert.equal(result.lowQuality, true);
  }
});

test('critic loop result always has required shape', { timeout: 60_000 }, async () => {
  const result = await runCriticLoop(GOOD_CHAPTER, GOOD_ANALYSIS, config, null);
  assert.ok('accepted' in result, 'result must have accepted field');
  assert.ok('retries' in result, 'result must have retries field');
  assert.ok('analysis' in result, 'result must have analysis field');
  assert.ok(typeof result.retries === 'number', 'retries must be a number');
});
