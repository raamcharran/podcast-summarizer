// Paid eval: 5-dimension quality gate tests using real LLM enrichment output
// Run with: npm run test:evals
// Requires AI provider env vars (ANTHROPIC_API_KEY, OPENAI_API_KEY, or claude-cli session)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAiConfig } from '../../lib/ai.js';
import { enrichChapters, synthesizeEpisode } from '../../lib/analyze.js';
import { runQualityGate } from '../../lib/eval.js';

const config = getAiConfig();

const EPISODE_META = {
  title: 'Cass Sunstein on Constitutional Theory and Free Speech',
  podcast_name: 'Conversations with Tyler',
  guest: 'Cass Sunstein',
  host: 'Tyler Cowen',
};

const CHAPTERS = [
  {
    id: 1,
    title: 'The Purpose of the Constitution',
    text: `COWEN: What is the Constitution really for? Is it primarily a constraint on government or a positive grant of authority?

SUNSTEIN: The Constitution serves multiple purposes. It establishes a framework for democratic governance that limits arbitrary power. It protects individual rights against majoritarian overreach. And it provides stable rules that allow citizens and institutions to plan their affairs. Hamilton in Federalist 70 argues for a strong energetic executive, which creates tension with Madison's vision of checks and balances. The document we got was a compromise between these competing views and that tension has never been fully resolved.`,
    speakerMap: { COWEN: 2, SUNSTEIN: 1 },
  },
  {
    id: 2,
    title: 'Originalism vs Living Constitution',
    text: `COWEN: How do you think about the originalism versus living Constitution debate?

SUNSTEIN: Both sides capture something important. Originalists are right that we need to anchor constitutional interpretation in text and history. But living constitutionalists are right that some provisions were meant to evolve with changing circumstances. The equal protection clause cannot mean today what it meant in 1868 given what we now know about discrimination and human dignity. Marbury v Madison established judicial review in 1803 and that was itself a creative act of constitutional interpretation by John Marshall that was not explicitly authorized by the text.`,
    speakerMap: { COWEN: 1, SUNSTEIN: 1 },
  },
  {
    id: 3,
    title: 'Free Speech and the Marketplace of Ideas',
    text: `COWEN: You've written extensively on free speech. What's your core view on the First Amendment?

SUNSTEIN: Freedom of speech is essential to democracy because it enables citizens to hold government accountable and promotes the discovery of truth through what Mill called the marketplace of ideas. The American approach of near-absolute protection for political speech is correct. But speech can cause real harm and we should be more willing to regulate speech that causes concrete harm without contributing to democratic self-governance. Social media algorithms optimize for engagement which produces outrage and confirmation bias, trapping people in what I call information cocoons that make genuine democratic deliberation much harder.`,
    speakerMap: { COWEN: 1, SUNSTEIN: 1 },
  },
];

// -------------------------
// Dim 3 (knowledge graph) and Dim 5 (insight spread) can be tested without
// paying for re-generation by injecting synthetic data.
// The two expensive tests use real LLM enrichment.
// -------------------------

test('quality gate passes on real LLM enrichment of substantive chapters', { timeout: 180_000 }, async () => {
  const analyses = await enrichChapters(CHAPTERS, EPISODE_META, config, null);

  // Verify enrichment returned something for each chapter
  assert.equal(analyses.length, 3);
  for (const a of analyses) {
    assert.ok(a !== null, 'enrichment should not return null for substantive chapters');
  }

  const synthesis = await synthesizeEpisode(CHAPTERS, analyses, EPISODE_META, config, null);

  const gate = runQualityGate(CHAPTERS, analyses, synthesis, null);

  // All scores should be reported
  assert.equal(gate.scores.length, 5);
  for (const s of gate.scores) {
    assert.ok(typeof s.score === 'number', `score for ${s.dimension} should be a number`);
    assert.ok(s.score >= 0 && s.score <= 5, `score for ${s.dimension} should be 0-5`);
  }

  // A substantive episode enriched by a real LLM should pass the gate
  // (or at least score ≥2 on each dimension — we're lenient here since LLMs vary)
  const failures = gate.scores.filter(s => s.score < 2);
  assert.equal(
    failures.length,
    0,
    `Dimensions scoring below 2: ${failures.map(f => `${f.dimension}=${f.score}`).join(', ')}`
  );
});

test('quality gate identifies weak chapters from generic enrichment', { timeout: 30_000 }, async () => {
  // Inject analyses that will fail dim 1, 2, 4 deterministically (no LLM needed)
  const genericAnalyses = [
    {
      summary: 'The speakers discuss ideas and explore concepts about things.',
      key_quote: 'Ideas matter.',
      concept_chips: ['ideas', 'knowledge'],
      insight_score: { novelty: 5, actionability: 5, specificity: 5 },
      speaker_map: {},
    },
    {
      summary: 'The speakers discuss ideas and explore concepts about things.',
      key_quote: 'Ideas matter.',
      concept_chips: ['ideas', 'knowledge'],
      insight_score: { novelty: 5, actionability: 5, specificity: 5 },
      speaker_map: {},
    },
    {
      summary: 'The speakers discuss ideas and explore concepts about things.',
      key_quote: 'Ideas matter.',
      concept_chips: ['ideas', 'knowledge'],
      insight_score: { novelty: 5, actionability: 5, specificity: 5 },
      speaker_map: {},
    },
  ];

  const weakSynthesis = { episode_thesis: '', nodes: [], edges: [] };

  const gate = runQualityGate(CHAPTERS, genericAnalyses, weakSynthesis, null);

  assert.equal(gate.pass, false, 'gate should fail on generic analyses');
  assert.ok(gate.weakChapters.length > 0, 'should identify weak chapters');
  assert.ok(gate.scores.some(s => s.score < 3), 'at least one dimension should score below 3');
});

test('quality gate passes on high-quality synthetic data', { timeout: 5_000 }, async () => {
  const highQualityAnalyses = [
    {
      summary: 'Hamilton advocated for a strong unitary executive in Federalist 70, arguing that decisiveness and accountability require concentrated authority. Madison countered with checks and balances, fearing tyranny from concentrated power. The Constitution reflects a compromise between these visions, leaving the tension unresolved for future generations to interpret.',
      key_quote: 'The price system aggregates information from millions of actors in a way that no central authority could replicate, embodying Hayek\'s insight about dispersed knowledge.',
      concept_chips: ['Federalist 70', 'Separation of Powers', 'Unitary Executive Theory', 'Checks and Balances'],
      insight_score: { novelty: 7, actionability: 3, specificity: 8 },
      speaker_map: {
        COWEN: 'Constitution as constraint on arbitrary power rather than positive grant of authority',
        SUNSTEIN: 'Founding document reflects unresolved Hamilton-Madison tension on executive power',
      },
    },
    {
      summary: "Marbury v Madison established judicial review through Marshall's creative constitutional interpretation, not explicit textual authorization. Originalists correctly anchor interpretation in text and history, but living constitutionalists are right that provisions like equal protection must evolve as moral understanding develops. The 1868 meaning of equal protection cannot bind modern courts given subsequent knowledge about discrimination.",
      key_quote: "The equal protection clause cannot mean today what it meant in 1868 given what we now know about discrimination and human dignity.",
      concept_chips: ['Marbury v Madison', 'Judicial Review', 'Originalism', 'Equal Protection Clause', 'Living Constitutionalism'],
      insight_score: { novelty: 5, actionability: 2, specificity: 9 },
      speaker_map: {
        COWEN: 'Originalism vs living constitutionalism as genuine interpretive tension',
        SUNSTEIN: 'Both originalism and living constitutionalism capture important truths',
      },
    },
    {
      summary: "Mill's marketplace of ideas justifies near-absolute First Amendment protection for political speech as essential to democratic accountability and truth discovery. Sunstein introduces the information cocoon problem — social media algorithms optimize for engagement, producing outrage and confirmation bias that undermines deliberative democracy. Regulating speech that causes concrete harm without democratic value is justified even under a strong free speech framework.",
      key_quote: "Social media algorithms optimize for engagement which produces outrage and confirmation bias, trapping people in information cocoons that make genuine democratic deliberation much harder.",
      concept_chips: ['Marketplace of Ideas', 'Information Cocoon', 'First Amendment Absolutism', 'Democratic Deliberation', 'Algorithmic Engagement Optimization'],
      insight_score: { novelty: 8, actionability: 6, specificity: 7 },
      speaker_map: {
        COWEN: 'Near-absolute free speech protection as correct American approach',
        SUNSTEIN: 'Information cocoons from algorithmic curation pose serious threat to democratic discourse',
      },
    },
  ];

  const richSynthesis = {
    episode_thesis: 'Sunstein argues that constitutional interpretation requires anchoring in text and history while remaining open to evolving moral understanding, and that free speech protections must be balanced against the information cocoon problem created by algorithmic curation.',
    nodes: [
      { id: 'invisible-hand', label: 'Invisible Hand', description: 'Adam Smith\'s coordination mechanism', chapters: [0] },
      { id: 'judicial-review', label: 'Judicial Review', description: 'Courts enforce constitution against legislation', chapters: [1] },
      { id: 'originalism', label: 'Originalism', description: 'Interpretation anchored in original text meaning', chapters: [1] },
      { id: 'living-constitution', label: 'Living Constitution', description: 'Constitutional meaning evolves over time', chapters: [1] },
      { id: 'free-speech', label: 'Free Speech', description: 'First Amendment protections', chapters: [2] },
      { id: 'marketplace-ideas', label: 'Marketplace of Ideas', description: "Mill's epistemic argument for free speech", chapters: [2] },
      { id: 'information-cocoon', label: 'Information Cocoon', description: 'Algorithmic filter bubbles in social media', chapters: [2] },
      { id: 'democratic-deliberation', label: 'Democratic Deliberation', description: 'Collective reasoning in self-governance', chapters: [2] },
      { id: 'checks-balances', label: 'Checks and Balances', description: "Madison's anti-tyranny mechanism", chapters: [0] },
    ],
    edges: [
      { from: 'originalism', to: 'living-constitution', label: 'contradicts' },
      { from: 'judicial-review', to: 'originalism', label: 'requires' },
      { from: 'free-speech', to: 'marketplace-ideas', label: 'enables' },
      { from: 'information-cocoon', to: 'democratic-deliberation', label: 'challenges' },
      { from: 'marketplace-ideas', to: 'democratic-deliberation', label: 'supports' },
      { from: 'checks-balances', to: 'judicial-review', label: 'extends' },
    ],
  };

  const gate = runQualityGate(CHAPTERS, highQualityAnalyses, richSynthesis, null);

  assert.equal(gate.pass, true, `Gate should pass on high-quality data. Failing dimensions: ${gate.scores.filter(s => s.score < 3).map(s => `${s.dimension}=${s.score}`).join(', ')}`);
  assert.equal(gate.weakChapters.length, 0, 'no weak chapters expected for high-quality data');

  // All 5 dimensions should score ≥3
  for (const s of gate.scores) {
    assert.ok(s.score >= 3, `${s.dimension} scored ${s.score}, expected ≥3`);
  }
});

test('quality gate reports all 5 dimensions', { timeout: 5_000 }, async () => {
  const emptyAnalyses = [null, null, null];
  const emptySynthesis = { nodes: [], edges: [] };

  const gate = runQualityGate(CHAPTERS, emptyAnalyses, emptySynthesis, null);

  const dimNames = gate.scores.map(s => s.dimension);
  assert.ok(dimNames.includes('text_quality'));
  assert.ok(dimNames.includes('infographic_completeness'));
  assert.ok(dimNames.includes('knowledge_graph'));
  assert.ok(dimNames.includes('speaker_attribution'));
  assert.ok(dimNames.includes('insight_spread'));
});
