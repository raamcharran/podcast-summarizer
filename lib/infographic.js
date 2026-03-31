// LLM-generated per-chapter SVG infographics
// Each SVG is a unique, content-driven visual mental model for that chapter
import pLimit from 'p-limit';
import { generateText } from './ai.js';

const INFOGRAPHIC_SYSTEM = `You are designing a single SVG infographic card for one chapter of a podcast episode.

PURPOSE: Create a visual mental model that a reader can understand in 5 seconds and remember for hours.
The visual must convey WHAT THE SPEAKER ACTUALLY SAID — not generic labels or template panels.

CANVAS: 760 wide × 400 tall. viewBox="0 0 760 400".

COLOR PALETTE (use only these):
  Background:    #111e1e
  Panel/card bg: #162020
  Accent orange: #ff6b4a  ← use for the most important thing
  Accent teal:   #2a7a7a  ← use for secondary emphasis
  Primary text:  #eeeeee
  Secondary text:#999999
  Muted text:    #555555
  Border/line:   #253535
  Dark panel:    #0d1818

TYPOGRAPHY: font-family="Inter,system-ui,sans-serif" only.
  font-weight 400 = body, 600 = label, 700 = heading, 900 = title

CHOOSE ONE VISUAL PATTERN based on what the chapter is actually about:

  COMPARISON — two people/ideas/systems contrasted
    Use two side-by-side panels. Label each with the actual concept name. Fill each with real content.

  CAUSAL CHAIN — one thing leads to another leads to another
    Left-to-right flow: [Box] → [Box] → [Box] → [Outcome]. Real labels from the chapter.

  SPECTRUM — ideas exist on a continuum or scale
    Horizontal axis with labeled endpoints. Place real concepts at their positions.

  HUB-SPOKE — one central idea with radiating implications
    Center circle with 4-6 spokes. Central label = the core concept. Spokes = implications.

  BEFORE/AFTER — transformation, disruption, or change
    Split canvas: left side = old world, right side = new world. Real contrast from the chapter.

  PYRAMID/HIERARCHY — ranked or nested concepts
    Top-down. Apex = most important. Layers below = supporting ideas.

  TIMELINE — sequence, evolution, or narrative arc
    Left-to-right with 3-5 labeled points. Real events or stages.

  BOLD INSIGHT — a single powerful idea deserves full-canvas treatment
    Large typography, geometric accent shape, the key concept made enormous.

RULES:
  - Put the chapter title very small (font-size 11, color #555555, top of canvas, y=18)
  - Make the KEY CONCEPT large and visually dominant
  - Use actual content from the chapter: real names, real claims, real examples
  - Visual weight (size, color, position) shows what matters most
  - The orange accent (#ff6b4a) should draw the eye to the single most important idea
  - Shapes: use rect, circle, path, line, polygon — no external images
  - All text must fit inside 760×400
  - Return ONLY the SVG markup: start with <svg and end with </svg>
  - No comments, no preamble, no explanation — ONLY the SVG`;

function buildInfographicPrompt(chapter, analysis) {
  const speakers = Object.entries(analysis.speaker_map || {})
    .map(([name, pos]) => `${name}: "${pos}"`)
    .join('\n');

  return `Create an SVG infographic for this podcast chapter.

Chapter title: "${chapter.title}"

What the speaker said (summary):
${analysis.summary || '(no summary)'}

Key concepts discussed: ${(analysis.concept_chips || []).join(', ')}

Speaker positions in this chapter:
${speakers || '(no speaker attribution)'}

Key quote: "${analysis.key_quote || ''}"

Pick the visual pattern that makes this chapter's core idea immediately obvious. Use real names, real concepts, and real claims from above — not generic placeholders.`;
}

function extractSvg(raw) {
  const start = raw.indexOf('<svg');
  const end = raw.lastIndexOf('</svg>');
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 6);
}

export async function generateInfographics(chapters, analyses, config, logger) {
  const limit = pLimit(4);

  return Promise.all(
    chapters.map((ch, i) =>
      limit(async () => {
        const analysis = analyses[i];
        if (!analysis) return null;

        logger?.step('infographic_start', { chapter: i + 1, title: ch.title });
        try {
          const raw = await generateText({
            system: INFOGRAPHIC_SYSTEM,
            prompt: buildInfographicPrompt(ch, analysis),
            maxTokens: 3500,
            config,
          });

          const svg = extractSvg(raw);
          if (!svg) {
            logger?.warn('infographic_no_svg', { chapter: i + 1 });
            return null;
          }

          logger?.step('infographic_done', { chapter: i + 1 });
          return svg;
        } catch (err) {
          logger?.warn('infographic_failed', { chapter: i + 1, error: err.message });
          return null;
        }
      })
    )
  );
}
