// 5-dimension final quality gate
// Score <3/5 on any dimension → re-generate weakest chapters (1 pass)

export function runQualityGate(chapters, analyses, synthesis, logger) {
  const scores = evaluateAll(chapters, analyses, synthesis);
  logger?.step('eval_gate', { scores });

  const failing = scores.filter(s => s.score < 3);
  if (!failing.length) return { pass: true, scores, weakChapters: [] };

  // Find the weakest chapters across all failing dimensions
  const weakChapterIndices = new Set();
  for (const dim of failing) {
    for (const idx of dim.weakChapters) weakChapterIndices.add(idx);
  }

  return {
    pass: false,
    scores,
    weakChapters: [...weakChapterIndices],
  };
}

function evaluateAll(chapters, analyses, synthesis) {
  return [
    evalTextQuality(chapters, analyses),
    evalInfographicCompleteness(analyses),
    evalKnowledgeGraph(synthesis),
    evalSpeakerAttribution(chapters, analyses),
    evalInsightSpread(analyses),
  ];
}

// Dim 1: Chapter text specificity — penalise generic filler phrases
function evalTextQuality(chapters, analyses) {
  const FILLERS = /discusses|talks about|explores|delves into|touches on/i;
  const weakChapters = [];
  let genericCount = 0;

  analyses.forEach((r, i) => {
    if (!r?.summary) { weakChapters.push(i); genericCount++; return; }
    if (FILLERS.test(r.summary)) { weakChapters.push(i); genericCount++; }
  });

  const score = Math.round(5 * (1 - genericCount / Math.max(analyses.length, 1)));
  return { dimension: 'text_quality', score: Math.max(0, score), weakChapters };
}

// Dim 2: Infographic completeness — chips, quotes, scores present and non-generic
function evalInfographicCompleteness(analyses) {
  const GENERIC_CHIPS = /^(technology|ideas|knowledge|economics|innovation|society|culture|research|science|business)$/i;
  const weakChapters = [];

  analyses.forEach((r, i) => {
    if (!r) { weakChapters.push(i); return; }
    const chips = r.concept_chips || [];
    const hasGenericChip = chips.some(c => GENERIC_CHIPS.test(c.trim()));
    const tooFewChips = chips.length < 3;
    const noQuote = !r.key_quote || r.key_quote.split(/\s+/).length < 15;
    const noScore = !r.insight_score;
    if (hasGenericChip || tooFewChips || noQuote || noScore) weakChapters.push(i);
  });

  const score = Math.round(5 * (1 - weakChapters.length / Math.max(analyses.length, 1)));
  return { dimension: 'infographic_completeness', score: Math.max(0, score), weakChapters };
}

// Dim 3: Knowledge graph richness — ≥8 nodes, meaningful edge labels
function evalKnowledgeGraph(synthesis) {
  const nodes = synthesis?.nodes || [];
  const edges = synthesis?.edges || [];
  const MEANINGFUL_LABELS = /challenges|requires|enables|contradicts|extends|supports|builds on|opposes/i;
  const meaningfulEdges = edges.filter(e => MEANINGFUL_LABELS.test(e.label || '')).length;

  let score = 5;
  if (nodes.length < 8) score -= 2;
  if (nodes.length < 4) score -= 1;
  if (edges.length < 4) score -= 1;
  if (meaningfulEdges < edges.length * 0.5) score -= 1;

  return { dimension: 'knowledge_graph', score: Math.max(0, score), weakChapters: [] };
}

// Dim 4: Speaker attribution — ideas attributed when labels exist
function evalSpeakerAttribution(chapters, analyses) {
  const weakChapters = [];
  chapters.forEach((ch, i) => {
    const hasLabels = ch.speakerMap && Object.keys(ch.speakerMap).length > 0;
    const r = analyses[i] || {};
    const hasAttribution = r.speaker_map && Object.keys(r.speaker_map).length > 0;
    if (hasLabels && !hasAttribution) weakChapters.push(i);
  });

  const score = weakChapters.length === 0 ? 5 : Math.max(0, 5 - weakChapters.length);
  return { dimension: 'speaker_attribution', score, weakChapters };
}

// Dim 5: Insight score spread — not all chapters rated the same
function evalInsightSpread(analyses) {
  const scores = analyses
    .filter(r => r?.insight_score)
    .map(r => {
      const s = r.insight_score;
      return Math.round((s.novelty || 0) * 0.4 + (s.actionability || 0) * 0.35 + (s.specificity || 0) * 0.25);
    });

  if (scores.length < 2) return { dimension: 'insight_spread', score: 5, weakChapters: [] };

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const spread = max - min;

  // Good spread: at least 3 points difference across the episode
  const score = spread >= 3 ? 5 : spread >= 2 ? 4 : spread >= 1 ? 3 : 1;
  return { dimension: 'insight_spread', score, weakChapters: [] };
}
