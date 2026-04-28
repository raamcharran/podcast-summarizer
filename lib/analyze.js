// Chapter enrichment — podcast-specific prompts, p-limit(4) concurrency
import pLimit from 'p-limit';
import { generateText, parseJsonResponse } from './ai.js';

const EPISODE_SYSTEM = `You are analyzing a podcast episode chapter.
Your job is to extract specific, high-value insights — NOT generic summaries.
Return ONLY valid JSON. No markdown fences, no commentary.`;

function buildEnrichPrompt(chapter, episodeMeta) {
  const speakerHint = Object.keys(chapter.speakerMap || {}).length
    ? `Speakers in this chapter: ${Object.keys(chapter.speakerMap).join(', ')}.`
    : 'No speaker labels detected.';

  return `Episode: "${episodeMeta.title}"
Podcast: ${episodeMeta.podcast_name || ''}
Guest: ${episodeMeta.guest || 'N/A'} | Host: ${episodeMeta.host || 'N/A'}
${speakerHint}

Chapter: "${chapter.title}"
Chapter text (${chapter.text.split(/\s+/).length} words):
---
${chapter.text.slice(0, 12_000)}
---

Return a JSON object with these exact fields:
{
  "summary": "3 sentences. Be specific: name the actual arguments, claims, data points, or examples discussed. No filler like 'the speaker discusses' or 'they talk about'.",
  "host_questions": "1-2 sentences describing the key questions or angles the interviewer raised in this chapter. Be specific — name the actual question or challenge posed.",
  "key_quote": "A verbatim quote from the chapter text — the single most memorable or insightful sentence. Must be 15+ words.",
  "concept_chips": ["array", "of", "3-5 specific named concepts"],
  "insight_score": {
    "novelty": 0-10,
    "actionability": 0-10,
    "specificity": 0-10
  },
  "speaker_map": {
    "Speaker Name": "main_argument_or_position_in_one_phrase"
  }
}

Rules for concept_chips: Use specific named concepts (e.g. "Effective Altruism", "Comparative Advantage", "Moral Patienthood"). Never use generic nouns like "ideas", "knowledge", "technology", "economics".
Rules for speaker_map: Only include speakers who actually appear in this chapter. Use the speaker name as key, their main argument as value.
Rules for host_questions: Focus on what the interviewer was trying to probe or challenge. If the chapter has no clear interviewer questions, describe the framing they set up.`;
}

function buildSynthesisPrompt(chapters, analyses, episodeMeta) {
  const chapterSummaries = chapters.map((ch, i) => {
    const r = analyses[i] || {};
    return `Chapter ${i + 1}: "${ch.title}"\nSummary: ${r.summary || ''}\nConcepts: ${(r.concept_chips || []).join(', ')}`;
  }).join('\n\n');

  const chCount = chapters.length;
  const minNodes = Math.max(25, Math.round(chCount * 1.5));

  return `Episode: "${episodeMeta.title}"
Podcast: ${episodeMeta.podcast_name || ''} | Guest: ${episodeMeta.guest || 'N/A'}
Chapters in this episode: ${chCount}

Chapter summaries:
${chapterSummaries}

Return a JSON object:
{
  "episode_thesis": "One paragraph (3-5 sentences) capturing the central argument of the entire episode. Be specific.",
  "nodes": [
    { "id": "slug-id", "label": "Concept Name", "description": "1-sentence description", "chapters": [0, 1] }
  ],
  "edges": [
    { "from": "node-id", "to": "other-node-id", "label": "relationship verb" }
  ]
}

Rules for knowledge graph:
- MINIMUM ${minNodes} nodes for this ${chCount}-chapter episode (target 35-40). Do not stop early — cover every significant concept.
- Every significant concept, person, technology, framework, company, or idea from the episode must appear as a node.
- Include both high-level themes AND specific named things (e.g. "CUDA", "HBM memory", "Amdahl's Law", "CoWoS packaging", "Vera Rubin", "Jevons Paradox", "TSMC", "NVLink" — not just "AI" or "compute")
- Each chapter should contribute at least 1-2 unique nodes beyond what other chapters cover.
- Edge labels must be specific verbs: "challenges", "requires", "enables", "contradicts", "extends", "supports", "depends on", "competes with", "created", "drives", "limits", "replaces", "underpins", "led to", "scales with"
- Aim for 1.5-2 edges per node (i.e. ${Math.round(minNodes * 1.5)}-${minNodes * 2} edges total).
- Every node must have at least one edge. Isolated nodes are not allowed.
- Chapter indices in nodes.chapters are 0-based
- Node IDs are lowercase-hyphenated slugs matching the label`;
}

export async function enrichChapters(chapters, episodeMeta, config, logger) {
  const limit = pLimit(4);

  const results = await Promise.all(
    chapters.map((ch, i) =>
      limit(async () => {
        const start = Date.now();
        logger?.step('enrich_start', { chapter: i + 1, title: ch.title });

        let raw;
        try {
          raw = await generateText({
            system: EPISODE_SYSTEM,
            prompt: buildEnrichPrompt(ch, episodeMeta),
            maxTokens: 1024,
            config,
          });
        } catch (err) {
          logger?.warn('enrich_llm_failed', { chapter: i + 1, error: err.message });
          return null;
        }

        try {
          const parsed = parseJsonResponse(raw);
          logger?.step('enrich_done', { chapter: i + 1, duration_ms: Date.now() - start });
          return parsed;
        } catch {
          logger?.warn('enrich_parse_failed', { chapter: i + 1, raw: raw.slice(0, 200) });
          return null;
        }
      })
    )
  );

  return results;
}

export async function synthesizeEpisode(chapters, analyses, episodeMeta, config, logger) {
  logger?.step('synthesis_start');
  let raw;
  try {
    raw = await generateText({
      system: EPISODE_SYSTEM,
      prompt: buildSynthesisPrompt(chapters, analyses, episodeMeta),
      maxTokens: 4096,
      config,
    });
  } catch (err) {
    logger?.warn('synthesis_failed', { error: err.message });
    return { episode_thesis: '', nodes: [], edges: [] };
  }

  try {
    const result = parseJsonResponse(raw);
    logger?.step('synthesis_done', {
      nodes: result.nodes?.length,
      edges: result.edges?.length,
    });
    return result;
  } catch {
    logger?.warn('synthesis_parse_failed', { raw: raw.slice(0, 200) });
    return { episode_thesis: '', nodes: [], edges: [] };
  }
}
