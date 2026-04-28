// Per-chapter critic loop — hard rules rubric, max 2 retries
import { generateText, parseJsonResponse } from './ai.js';
import { enrichChapters } from './analyze.js';

const CRITIC_SYSTEM = `You are a quality critic for podcast chapter summaries.
Apply the rules below strictly. Return ONLY valid JSON.`;

const CRITIC_PROMPT = (chapter, analysis) => `
Review this chapter analysis for quality. Return {"pass": bool, "issues": string[]}

Chapter title: "${chapter.title}"
Analysis:
${JSON.stringify(analysis, null, 2)}

FAIL (set pass=false and list issues) if ANY of these conditions are true:
1. summary contains "discusses", "talks about", "explores", "delves into", or "touches on" without a specific claim immediately following
2. concept_chips has fewer than 3 items, OR any chip is a generic noun such as "technology", "ideas", "knowledge", "economics", "innovation", "society", "culture", "research", "science", "business"
3. key_quote is shorter than 15 words
4. all three insight_score sub-scores (novelty, actionability, specificity) are within 1 point of each other (suspiciously flat distribution)
5. speaker_map is empty AND the chapter text contains speaker labels (e.g. "COWEN:", "PATEL:")

If none of the above: set pass=true and issues=[].
Return ONLY the JSON object.`;

export async function runCriticLoop(chapter, analysis, config, logger) {
  const MAX_RETRIES = 3;
  let current = analysis;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let raw;
    try {
      raw = await generateText({
        system: CRITIC_SYSTEM,
        prompt: CRITIC_PROMPT(chapter, current),
        maxTokens: 512,
        config,
      });
    } catch (err) {
      logger?.warn('critic_llm_failed', { chapter: chapter.title, attempt, error: err.message });
      break;
    }

    let verdict;
    try {
      verdict = parseJsonResponse(raw);
    } catch {
      logger?.warn('critic_parse_failed', { chapter: chapter.title, attempt });
      break;
    }

    if (verdict.pass) {
      if (attempt > 0) {
        logger?.step('critic_passed_after_retry', { chapter: chapter.title, retries: attempt });
      }
      return { analysis: current, retries: attempt, accepted: true };
    }

    // Failed — re-generate with issues as guidance
    logger?.step('critic_fail', { chapter: chapter.title, attempt, issues: verdict.issues });

    const [regenerated] = await enrichChapters(
      [{ ...chapter, _criticIssues: verdict.issues }],
      chapter._episodeMeta || {},
      config,
      logger
    );

    if (regenerated) {
      current = regenerated;
    }
  }

  // Accepted after max retries with warning
  logger?.warn('critic_max_retries', { chapter: chapter.title });
  return { analysis: current, retries: MAX_RETRIES, accepted: true, lowQuality: true };
}
