// Markdown / Obsidian export for podcast episodes
export function buildMarkdown(meta, chapters, analyses) {
  const lines = [
    `# ${meta.title}`,
    `**Podcast:** ${meta.podcast_name || ''}  `,
    `**Guest:** ${meta.guest || 'N/A'}  `,
    `**Host:** ${meta.host || 'N/A'}  `,
    `**Date:** ${meta.date || 'N/A'}`,
    '',
    `## Episode Thesis`,
    '',
    `${meta.episode_thesis || ''}`,
    '',
    `---`,
    '',
    `## Chapter Summaries`,
    '',
  ];

  chapters.forEach((ch, i) => {
    const r = analyses[i] || {};
    const score = r.insight_score || {};
    const combined = Math.round(
      (score.novelty || 0) * 0.4 +
      (score.actionability || 0) * 0.35 +
      (score.specificity || 0) * 0.25
    );
    const stars = '★'.repeat(Math.min(5, Math.max(1, Math.round(combined / 2)))) +
                  '☆'.repeat(5 - Math.min(5, Math.max(1, Math.round(combined / 2))));

    lines.push(`### ${ch.title}`);
    if (r.speaker_map && Object.keys(r.speaker_map).length) {
      const speakers = Object.keys(r.speaker_map).join(', ');
      lines.push(`*Speakers: ${speakers}* | Insight: ${stars}`);
    } else {
      lines.push(`*Insight: ${stars}*`);
    }
    lines.push('');
    lines.push(`${r.summary || ''}`);
    lines.push('');

    if (r.key_quote) {
      lines.push(`> "${r.key_quote}"`);
      lines.push('');
    }

    if (r.concept_chips?.length) {
      lines.push(`**Concepts:** ${r.concept_chips.join(' · ')}`);
      lines.push('');
    }
  });

  return lines.join('\n');
}
