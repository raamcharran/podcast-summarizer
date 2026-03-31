// HTML assembly — podcast infographic with D3.js knowledge graph and RAG Q&A
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { escapeHtml } from './util.js';
import { buildMarkdown } from './markdown.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const D3_INLINE = readFileSync(join(__dirname, 'd3.v7.min.js'), 'utf8');

// Minimal TF-IDF query function embedded in the HTML for client-side RAG
const TFIDF_QUERY_INLINE = `
function clientQuery(index, queryStr, topK) {
  const stop = new Set('a an the and or but in on at to for of with is are was were be been have has do does did will would could should may might not no it its this that i you'.split(' '));
  function tok(t) { return (t.toLowerCase().match(/[a-z]+/g)||[]).filter(w=>!stop.has(w)&&w.length>2); }
  function buildVec(tokens, idf) {
    const tf={}, total=Math.max(tokens.length,1);
    for(const t of tokens) tf[t]=(tf[t]||0)+1;
    const vec={};
    for(const [t,c] of Object.entries(tf)) { if(idf[t]!=null) vec[t]=(c/total)*idf[t]; }
    const norm=Math.sqrt(Object.values(vec).reduce((s,v)=>s+v*v,0))||1;
    for(const t in vec) vec[t]/=norm;
    return vec;
  }
  const qVec = buildVec(tok(queryStr), index.idf);
  return index.vectors.map((vec,i)=>{
    let dot=0;
    for(const [t,v] of Object.entries(qVec)) { if(vec[t]) dot+=v*vec[t]; }
    return {...index.chunks[i], score:dot};
  }).sort((a,b)=>b.score-a.score).slice(0,topK||5);
}
`;

function wordCount(t) { return t.split(/\s+/).filter(Boolean).length; }

function formatDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return d; }
}

const ERROR_SUMMARY_RE = /too short to extract|no substantive|no content to analyze|only \d+ words|chapter text provided contains no|chapter fragment/i;

// REMOVED: buildChapterSvg — infographics are now LLM-generated (lib/infographic.js)
// Keeping this tombstone so git blame is clear.

function _unused_buildChapterSvg(chapter, analysis, chIndex) {
  const r = analysis || {};
  const score = r.insight_score || {};
  const chips = (r.concept_chips || []).slice(0, 6);
  const speakerEntries = Object.entries(r.speaker_map || {}).slice(0, 4);
  const quote = (r.key_quote || '').replace(/"/g, '\u201c').replace(/"/g, '\u201d');
  const stars = insightStars(r.insight_score);
  const title = chapter.title.length > 52 ? chapter.title.slice(0, 50) + '\u2026' : chapter.title;
  const num = String(chIndex + 1).padStart(2, '0');

  const W = 760, H = 400;
  const ACCENT = '#ff6b4a';
  const BG = '#111e1e';
  const BG2 = '#162020';
  const BORDER = '#253535';
  const TXTPRI = '#eeeeee';
  const TXTSEC = '#aaaaaa';
  const TXTDIM = '#666666';
  const BARTRACK = '#1e2e2e';
  const BARFILL = '#ff6b4a';

  // Insight bars
  const barDims = [
    { label: 'Novelty', val: score.novelty || 0 },
    { label: 'Action', val: score.actionability || 0 },
    { label: 'Specific', val: score.specificity || 0 },
  ];
  const BAR_X = 28, BAR_W = 140, BAR_H = 10, BAR_Y0 = 145;
  const insightBars = barDims.map((b, i) => {
    const y = BAR_Y0 + i * 38;
    const fill = Math.round((b.val / 10) * BAR_W);
    return `
    <text x="${BAR_X}" y="${y - 4}" font-size="9" font-weight="700" fill="${TXTDIM}" font-family="Inter,sans-serif" letter-spacing="0.08em" text-transform="uppercase">${escapeHtml(b.label.toUpperCase())}</text>
    <rect x="${BAR_X}" y="${y}" width="${BAR_W}" height="${BAR_H}" rx="2" fill="${BARTRACK}"/>
    <rect x="${BAR_X}" y="${y}" width="${fill}" height="${BAR_H}" rx="2" fill="${BARFILL}" opacity="0.9"/>
    <text x="${BAR_X + BAR_W + 8}" y="${y + 9}" font-size="11" font-weight="700" fill="${ACCENT}" font-family="Inter,sans-serif">${b.val}</text>`;
  }).join('');

  // Speaker entries in left panel
  const speakerY0 = BAR_Y0 + barDims.length * 38 + 24;
  const speakerSvg = speakerEntries.map(([ name, pos ], i) => {
    const y = speakerY0 + i * 34;
    const nameShort = name.length > 16 ? name.slice(0, 15) + '\u2026' : name;
    const posShort = pos.length > 28 ? pos.slice(0, 26) + '\u2026' : pos;
    return `
    <circle cx="${BAR_X + 5}" cy="${y - 4}" r="4" fill="${ACCENT}" opacity="0.8"/>
    <text x="${BAR_X + 16}" y="${y}" font-size="10" font-weight="700" fill="${TXTPRI}" font-family="Inter,sans-serif">${escapeHtml(nameShort)}</text>
    <text x="${BAR_X + 16}" y="${y + 14}" font-size="9" font-weight="400" fill="${TXTSEC}" font-family="Inter,sans-serif">${escapeHtml(posShort)}</text>`;
  }).join('');

  // Concept chips — middle panel
  const CHIP_X0 = 268, CHIP_Y0 = 115, CHIP_H = 26, CHIP_GAP_Y = 10, CHIP_PAD_X = 10;
  const CHIP_COL_W = 108, CHIP_GAP_X = 8;
  const chipsSvg = chips.map((chip, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = CHIP_X0 + col * (CHIP_COL_W + CHIP_GAP_X);
    const cy = CHIP_Y0 + row * (CHIP_H + CHIP_GAP_Y);
    const chipLabel = chip.length > 14 ? chip.slice(0, 13) + '\u2026' : chip;
    return `
    <rect x="${cx}" y="${cy}" width="${CHIP_COL_W}" height="${CHIP_H}" rx="13" fill="${BG2}" stroke="${BORDER}" stroke-width="1"/>
    <text x="${cx + CHIP_COL_W / 2}" y="${cy + 17}" font-size="9" font-weight="700" fill="${TXTSEC}" font-family="Inter,sans-serif" text-anchor="middle" letter-spacing="0.06em">${escapeHtml(chipLabel.toUpperCase())}</text>`;
  }).join('');

  // Key quote — right panel
  const QUOTE_X = 516, QUOTE_Y0 = 115, QUOTE_LINE_H = 19, QUOTE_MAX_W = 32;
  const quoteLines = wrapSvgText(quote, QUOTE_MAX_W).slice(0, 7);
  const quoteSvg = quoteLines.map((line, i) => {
    const isFirst = i === 0;
    const displayLine = isFirst ? '\u201c' + line : (i === quoteLines.length - 1 ? line + '\u201d' : line);
    return `<text x="${QUOTE_X}" y="${QUOTE_Y0 + i * QUOTE_LINE_H}" font-size="11" font-style="italic" fill="${TXTSEC}" font-family="Inter,sans-serif">${escapeHtml(displayLine)}</text>`;
  }).join('');

  // Section label backgrounds
  const LABEL_Y = 98;
  const sectionLabels = [
    { x: BAR_X, label: 'INSIGHT SCORES' },
    { x: CHIP_X0, label: 'KEY CONCEPTS' },
    { x: QUOTE_X, label: 'KEY QUOTE' },
  ].map(({ x, label }) =>
    `<text x="${x}" y="${LABEL_Y}" font-size="9" font-weight="700" fill="${ACCENT}" font-family="Inter,sans-serif" letter-spacing="0.12em">${label}</text>`
  ).join('');

  // Vertical dividers
  const dividers = [252, 504].map(dx =>
    `<line x1="${dx}" y1="88" x2="${dx}" y2="${H - 20}" stroke="${BORDER}" stroke-width="1" opacity="0.6"/>`
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;max-width:100%;border:1px solid ${BORDER};border-radius:2px;">
  <defs>
    <linearGradient id="hdr-grad-${chIndex}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <!-- Header strip -->
  <rect width="${W}" height="82" fill="url(#hdr-grad-${chIndex})"/>
  <rect width="${W}" height="82" fill="none" stroke="${BORDER}" stroke-width="0"/>
  <line x1="0" y1="82" x2="${W}" y2="82" stroke="${BORDER}" stroke-width="1"/>
  <!-- Chapter num + title -->
  <text x="28" y="34" font-size="10" font-weight="700" fill="${ACCENT}" font-family="Inter,sans-serif" letter-spacing="0.16em">CH · ${escapeHtml(num)}</text>
  <text x="28" y="62" font-size="21" font-weight="900" fill="${TXTPRI}" font-family="Inter,sans-serif">${escapeHtml(title)}</text>
  <!-- Stars -->
  <text x="${W - 28}" y="62" font-size="13" fill="${ACCENT}" font-family="Inter,sans-serif" text-anchor="end" letter-spacing="2">${escapeHtml(stars)}</text>
  <!-- Dividers -->
  ${dividers}
  <!-- Section labels -->
  ${sectionLabels}
  <!-- Insight bars -->
  ${insightBars}
  <!-- Speaker map -->
  ${speakerSvg}
  <!-- Concept chips -->
  ${chipsSvg}
  <!-- Key quote -->
  ${quoteSvg}
  <!-- Bottom border -->
  <line x1="0" y1="${H - 1}" x2="${W}" y2="${H - 1}" stroke="${BORDER}" stroke-width="1"/>
</svg>`;
}

function insightStars(score) {
  if (!score) return '';
  const combined = Math.round(
    (score.novelty || 0) * 0.4 +
    (score.actionability || 0) * 0.35 +
    (score.specificity || 0) * 0.25
  );
  const out = Math.min(5, Math.max(1, Math.round(combined / 2)));
  return '★'.repeat(out) + '☆'.repeat(5 - out);
}

function speakerBadges(speakerMap) {
  if (!speakerMap || !Object.keys(speakerMap).length) return '';
  return Object.entries(speakerMap)
    .map(([name]) => `<span class="speaker-badge">${escapeHtml(name)}</span>`)
    .join('');
}

export function assembleHtml(meta, chapters, analyses, synthesis, ragIndex, infographics = []) {
  const totalWords = chapters.reduce((s, c) => s + wordCount(c.text), 0);
  const thesis = synthesis.episode_thesis || meta.episode_thesis || '';

  const navLinks = chapters.map((ch, i) => {
    const num = String(i + 1).padStart(2, '0');
    return `<a href="#${ch.id}" title="${escapeHtml(ch.title)}">${num}</a>`;
  }).join('\n');

  const chapterListItems = chapters.map((ch, i) => {
    const num = String(i + 1).padStart(2, '0');
    const r = analyses[i] || {};
    const firstSentence = (r.summary || '').split(/(?<=[.!?])\s+/)[0] || '';
    const isError = ERROR_SUMMARY_RE.test(firstSentence);
    const subtitle = isError ? '' : (firstSentence.length > 110 ? firstSentence.slice(0, 107) + '…' : firstSentence);
    return `<li><a href="#${ch.id}" class="ch-list-link"><span class="ch-list-num">${num}</span><span class="ch-list-body"><span class="ch-list-title">${escapeHtml(ch.title)}</span>${subtitle ? `<span class="ch-list-sub">${escapeHtml(subtitle)}</span>` : ''}</span></a></li>`;
  }).join('\n');

  const chSections = chapters.map((ch, i) => {
    const r = analyses[i] || {};
    const partNum = String(i + 1).padStart(2, '0');
    const badges = speakerBadges(r.speaker_map);
    const chips = (r.concept_chips || []).map(c => `<span class="chip">${escapeHtml(c)}</span>`).join('');
    const summaryHtml = (r.summary || '').split('\n').filter(Boolean).slice(0, 5)
      .map(p => `<p>${escapeHtml(p)}</p>`).join('');
    const hostQHtml = r.host_questions
      ? `<div class="host-q"><span class="host-q-label">Interviewer</span><p>${escapeHtml(r.host_questions)}</p></div>`
      : '';
    const quote = r.key_quote
      ? `<blockquote>${escapeHtml(r.key_quote)}</blockquote>`
      : '';
    const conceptIds = (r.concept_chips || []).map(c =>
      c.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    ).join(',');
    const svgCard = infographics[i] || '';

    const stars = r.insight_score ? `<span class="insight-stars">${insightStars(r.insight_score)}</span>` : '';
    return `
<section id="${ch.id}" data-concepts="${escapeHtml(conceptIds)}" class="ch-section">
  <span class="part-label">Chapter [ ${partNum} ]</span>
  <div class="ch-header">
    <h2>${escapeHtml(ch.title)}</h2>
    ${(badges || stars) ? `<div class="ch-meta">${badges ? `<div class="speaker-badges">${badges}</div>` : ''}${stars}</div>` : ''}
  </div>
  ${svgCard ? `<div class="ch-infographic">${svgCard}</div>` : ''}
  ${hostQHtml}
  ${chips ? `<div class="chips">${chips}</div>` : ''}
  <div class="ch-summary">${summaryHtml}</div>
  ${quote ? `<div class="quotes">${quote}</div>` : ''}
</section>`;
  }).join('');

  const graphData = JSON.stringify({ nodes: synthesis.nodes || [], edges: synthesis.edges || [] });
  const markdownStr = JSON.stringify(buildMarkdown(
    { ...meta, episode_thesis: thesis },
    chapters,
    analyses
  ));
  const ragInline = ragIndex ? JSON.stringify(ragIndex) : 'null';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(meta.title)} — Podcast Infographic</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
html{scroll-behavior:smooth}
*,*::before,*::after{box-sizing:border-box}
body{font-family:'Outfit',sans-serif;background-color:#182828;background-image:radial-gradient(circle,#253535 1.5px,transparent 1.5px);background-size:24px 24px;color:#aaa;margin:0;padding:0;line-height:1.8}
.wrap{max-width:960px;margin:0 auto;padding:0 40px 140px}
@media(max-width:600px){.wrap{padding:0 20px 80px}}
h1,h2,h3,h4{font-family:'Space Grotesk',sans-serif;line-height:1.15;margin:0;font-weight:700}
a{color:#ff6b4a;text-decoration:none}
a:hover{color:#ff8c75}
a:focus-visible{outline:2px solid #ff6b4a;outline-offset:3px;border-radius:2px}
button:focus-visible{outline:2px solid #ff6b4a;outline-offset:3px}
.top-nav{position:sticky;top:0;z-index:100;background:#182828;border-bottom:1px solid #253535;padding:0 40px;display:flex;align-items:center;gap:16px;height:52px}
.top-nav .pod-label{flex-shrink:0;color:#eee;font-weight:700;font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;font-family:'Space Grotesk',sans-serif}
.top-nav .pod-label .sep{color:#ff6b4a;margin:0 8px}
.top-nav .nav-links{display:flex;overflow-x:auto;scrollbar-width:none;flex:1;gap:0}
.top-nav .nav-links::-webkit-scrollbar{display:none}
.top-nav .nav-links a{flex-shrink:0;padding:0 9px;height:52px;display:flex;align-items:center;font-size:.65rem;font-weight:600;color:#666;white-space:nowrap;text-transform:uppercase;letter-spacing:.1em;transition:color .15s;font-family:'Space Grotesk',sans-serif}
.top-nav .nav-links a:hover,.top-nav .nav-links a.active{color:#ff6b4a;text-decoration:none}
.hero{padding:120px 0 100px;border-bottom:1px solid #253535}
.hero .podcast-name{color:#888;font-size:.78rem;font-weight:600;margin:0 0 20px;text-transform:uppercase;letter-spacing:.14em;font-family:'Space Grotesk',sans-serif}
.hero h1{font-size:clamp(2.2rem,5vw,4rem);font-weight:700;color:#ff6b4a;line-height:1.08;margin:0 0 24px;letter-spacing:-.02em;max-width:860px}
.hero .meta-line{color:#666;font-size:.84rem;margin:0 0 6px}
.hero .episode-link{display:inline-block;margin-top:20px;padding:7px 18px;border:1px solid #2a3e3e;color:#666;font-size:.68rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;font-family:'Space Grotesk',sans-serif;transition:color .15s,border-color .15s}
.hero .episode-link:hover{color:#ff6b4a;border-color:#ff6b4a}
.part-label{display:block;font-size:.62rem;font-weight:700;color:#ff6b4a;text-transform:uppercase;letter-spacing:.22em;margin:0 0 16px;font-family:'Space Grotesk',sans-serif}
.thesis-box{padding:80px 0;border-bottom:1px solid #253535}
.thesis-box p{margin:0;font-size:1.25rem;line-height:1.75;color:#ddd;font-weight:400;max-width:800px}
.chapter-list{padding:80px 0;border-bottom:1px solid #253535}
.section-title{font-size:2.6rem;color:#eee;margin:0;font-weight:700}
.ch-section{padding:60px 0;border-bottom:1px solid #253535;opacity:0;transform:translateY(10px);transition:opacity .5s ease,transform .5s ease}
.ch-section.visible{opacity:1;transform:none}
.ch-section.highlight .ch-header h2{color:#ff6b4a}
.ch-header{margin-bottom:14px}
.ch-header h2{font-size:1.85rem;color:#eee;font-weight:700;margin-bottom:10px;line-height:1.2}
.ch-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.speaker-badges{display:flex;gap:6px;flex-wrap:wrap}
.speaker-badge{font-size:.6rem;font-weight:600;color:#777;background:#1e2e2e;border:1px solid #253535;padding:3px 9px;text-transform:uppercase;letter-spacing:.1em;font-family:'Space Grotesk',sans-serif}
.insight-stars{font-size:.82rem;color:#ff6b4a;letter-spacing:2px}
.chips{display:flex;gap:7px;flex-wrap:wrap;margin:16px 0 20px}
.chip{font-size:.62rem;font-weight:600;color:#999;background:#1e2e2e;border:1px solid #2a3e3e;padding:4px 10px;text-transform:uppercase;letter-spacing:.08em;font-family:'Space Grotesk',sans-serif}
.ch-infographic{margin:24px 0 32px;overflow-x:auto}
.ch-infographic svg{max-width:100%;height:auto}
.host-q{margin:0 0 22px;padding:14px 20px;border-left:2px solid #3a6060;background:#111e1e}
.host-q-label{display:block;font-size:.6rem;font-weight:700;color:#3a9090;text-transform:uppercase;letter-spacing:.18em;margin-bottom:7px;font-family:'Space Grotesk',sans-serif}
.host-q p{margin:0;color:#888;font-size:.9rem;line-height:1.75;font-style:italic}
.ch-summary p{margin:0 0 16px;color:#aaa;font-size:1rem;line-height:1.9}
.quotes{margin-top:32px}
blockquote{border-left:2px solid #ff6b4a;margin:20px 0;padding:10px 0 10px 24px;background:none;color:#ccc;font-size:1.02rem;font-style:italic;line-height:1.75}
#kg-wrap{padding:80px 0;border-bottom:1px solid #253535}
.kg-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:32px}
.kg-copy h2{font-size:2.6rem;color:#eee;margin-bottom:8px;font-weight:700}
.kg-copy p{color:#666;font-size:.85rem;margin:0}
.kg-controls{display:flex;align-items:center;gap:16px}
.kg-btn{background:none;color:#777;border:none;padding:0;font-size:.72rem;font-weight:700;cursor:pointer;text-transform:uppercase;letter-spacing:.14em;transition:color .15s;font-family:'Space Grotesk',sans-serif}
.kg-btn:hover{color:#ff6b4a}
.kg-frame{position:relative;height:min(82vh,820px);min-height:500px;background-color:#182828;background-image:radial-gradient(circle,#253535 1.5px,transparent 1.5px);background-size:24px 24px;border:1px solid #253535;overflow:hidden}
#kg-svg{width:100%;height:100%;display:block}
.node circle{cursor:pointer}.node circle:hover{filter:brightness(1.15)}
.node text{pointer-events:none;font-size:11px;font-weight:600;fill:#eee;font-family:'Space Grotesk',sans-serif}
.link line{stroke-opacity:.35}
.edge-label{font-size:9px;fill:#666;pointer-events:none}
.tooltip{position:fixed;background:#1e2e2e;color:#eee;border:1px solid #253535;padding:10px 14px;font-size:13px;pointer-events:none;max-width:260px;line-height:1.5;z-index:999;display:none;box-shadow:0 4px 24px rgba(0,0,0,.7)}
.chapter-list ul{list-style:none;margin:32px 0 0;padding:0;columns:2;column-gap:40px}
@media(max-width:600px){.chapter-list ul{columns:1}}
.ch-list-link{display:flex;align-items:flex-start;gap:16px;padding:13px 0;border-bottom:1px solid #1e2e2e;color:#aaa;text-decoration:none;transition:color .15s}
.ch-list-link:hover{color:#ff6b4a;text-decoration:none}
.ch-list-num{flex-shrink:0;font-size:.62rem;font-weight:700;color:#ff6b4a;letter-spacing:.12em;min-width:22px;padding-top:3px;font-family:'Space Grotesk',sans-serif}
.ch-list-body{display:flex;flex-direction:column;gap:4px}
.ch-list-title{font-size:.88rem;font-weight:600;color:#ddd;line-height:1.35;font-family:'Space Grotesk',sans-serif}
.ch-list-link:hover .ch-list-title{color:#ff6b4a}
.ch-list-sub{font-size:.78rem;font-weight:400;color:#555;line-height:1.5}
.ch-list-divider{height:1px;background:#253535;margin:16px 0;break-inside:avoid;break-after:avoid;column-span:none;list-style:none}
.ch-list-link--section .ch-list-num{color:#666;font-size:.85rem;min-width:22px}
.ch-list-link--section .ch-list-title{color:#888}
.ch-list-link--section:hover .ch-list-title{color:#ff6b4a}
.ch-list-link--section:hover .ch-list-num{color:#ff6b4a}
#rag-wrap{padding:80px 0;border-bottom:1px solid #253535}
#rag-wrap h2{font-size:2.6rem;color:#eee;margin-bottom:8px;font-weight:700}
#rag-wrap .rag-desc{color:#666;font-size:.85rem;margin:0 0 28px}
.rag-form{display:flex;gap:12px;margin-bottom:24px}
.rag-input{flex:1;background:#1e2e2e;border:1px solid #2a3e3e;color:#eee;padding:12px 16px;font-size:.9rem;font-family:'Outfit',sans-serif;outline:none;transition:border-color .15s}
.rag-input:focus{border-color:#ff6b4a}
.rag-btn{background:transparent;color:#ff6b4a;border:1px solid #ff6b4a;padding:12px 24px;font-size:.68rem;cursor:pointer;font-weight:700;letter-spacing:.14em;text-transform:uppercase;transition:all .2s;font-family:'Space Grotesk',sans-serif;white-space:nowrap}
.rag-btn:hover{background:#ff6b4a;color:#182828}
.rag-answer{display:none;background:#1e2e2e;border:1px solid #2a3e3e;padding:20px 24px}
.rag-answer p{margin:0 0 12px;color:#ccc;line-height:1.75}
.rag-answer .rag-source{font-size:.72rem;color:#555;margin:0}
.export-wrap{padding:80px 0 0;text-align:left}
.export-btn{background:transparent;color:#ff6b4a;border:1px solid #ff6b4a;padding:12px 28px;font-size:.7rem;cursor:pointer;font-weight:700;letter-spacing:.16em;text-transform:uppercase;transition:all .2s;font-family:'Space Grotesk',sans-serif}
.export-btn:hover{background:#ff6b4a;color:#182828}
@media(prefers-reduced-motion:reduce){.ch-section{transition:none;opacity:1;transform:none}html{scroll-behavior:auto}}
#scroll-progress{position:fixed;top:0;left:0;height:3px;width:0%;background:linear-gradient(90deg,#2a7a7a 0%,#ff6b4a 60%,#ff8c75 100%);z-index:9999;transition:width .1s linear;pointer-events:none;box-shadow:0 0 6px rgba(255,107,74,.6)}
</style>
<noscript><style>.ch-section{opacity:1!important;transform:none!important}</style></noscript>
</head>
<body>
<nav class="top-nav">
  <div class="pod-label">${escapeHtml(meta.podcast_name || 'Podcast')}<span class="sep">/</span>Summary</div>
  <div class="nav-links">
    ${navLinks}
    <a href="#kg-wrap">Knowledge Graph</a>
    <a href="#rag-wrap">Ask Episode</a>
  </div>
</nav>

<div class="wrap">

<header class="hero">
  <p class="podcast-name">${escapeHtml(meta.podcast_name || '')}</p>
  <h1>${escapeHtml(meta.title)}</h1>
  <p class="meta-line">${escapeHtml(meta.guest ? `with ${meta.guest}` : '')}${meta.date ? ` &middot; ${escapeHtml(formatDate(meta.date))}` : ''}</p>
  <p class="meta-line">${totalWords.toLocaleString()} words &middot; ${chapters.length} chapters</p>
  ${(meta.episodeUrl || meta.sourceUrl) ? `<a class="episode-link" href="${escapeHtml(meta.episodeUrl || meta.sourceUrl)}" target="_blank" rel="noopener">↗ Official Episode</a>` : ''}
</header>

<div class="chapter-list">
  <span class="part-label">Contents</span>
  <h2 class="section-title">Chapters</h2>
  <ul>
    ${chapterListItems}
    <li class="ch-list-divider"></li>
    <li><a href="#kg-wrap" class="ch-list-link ch-list-link--section"><span class="ch-list-num">⬡</span><span class="ch-list-body"><span class="ch-list-title">Knowledge Graph</span><span class="ch-list-sub">Interactive concept map for the full episode</span></span></a></li>
    <li><a href="#rag-wrap" class="ch-list-link ch-list-link--section"><span class="ch-list-num">⌕</span><span class="ch-list-body"><span class="ch-list-title">Ask the Episode</span><span class="ch-list-sub">Search the transcript with a question</span></span></a></li>
  </ul>
</div>

<div class="thesis-box">
  <span class="part-label">Episode Thesis</span>
  <p>${escapeHtml(thesis)}</p>
</div>

<div class="chapters-intro" style="padding:80px 0 0">
  <span class="part-label">Chapter Summaries</span>
</div>
${chSections}

<div id="kg-wrap">
  <span class="part-label">Concept Map</span>
  <div class="kg-head">
    <div class="kg-copy">
      <h2>Knowledge Graph</h2>
      <p>Click a node to highlight chapters. Drag to pan, scroll to zoom.</p>
    </div>
    <div class="kg-controls">
      <button class="kg-btn" id="kg-zoom-out" type="button">−</button>
      <button class="kg-btn" id="kg-reset" type="button">Reset</button>
      <button class="kg-btn" id="kg-zoom-in" type="button">+</button>
    </div>
  </div>
  <div class="kg-frame">
    <svg id="kg-svg"></svg>
  </div>
</div>

<div id="rag-wrap">
  <span class="part-label">Ask the Episode</span>
  <h2>Ask the Episode</h2>
  <p class="rag-desc">Ask any question about this episode — answers are grounded in the transcript.</p>
  <div class="rag-form">
    <input type="text" class="rag-input" id="rag-q" placeholder="What did they say about…?" />
    <button class="rag-btn" id="rag-ask">Ask</button>
  </div>
  <div class="rag-answer" id="rag-answer">
    <p id="rag-answer-text"></p>
    <p class="rag-source" id="rag-answer-source"></p>
  </div>
</div>

<div class="export-wrap">
  <button class="export-btn" id="export-btn">Download summary.md</button>
</div>

</div>
<div id="scroll-progress"></div>
<div class="tooltip" id="tooltip"></div>

<script>${D3_INLINE}</script>
<script>
// Scroll progress bar
const _prog = document.getElementById('scroll-progress');
window.addEventListener('scroll', () => {
  const h = document.documentElement.scrollHeight - window.innerHeight;
  _prog.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + '%';
}, { passive: true });

// Intersection observer for chapter fade-in (with fallback for iPad Safari / file:// quirks)
const _chSections = document.querySelectorAll('.ch-section');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.06 });
  _chSections.forEach(el => io.observe(el));
  // Fallback: if no section became visible within 2s, force-show all (iPad file:// bug)
  setTimeout(() => {
    const anyVisible = document.querySelector('.ch-section.visible');
    if (!anyVisible) _chSections.forEach(el => el.classList.add('visible'));
  }, 2000);
} else {
  _chSections.forEach(el => el.classList.add('visible'));
}

// Active nav link on scroll
const sections = document.querySelectorAll('[id]');
const navAs = document.querySelectorAll('.nav-links a');
const observer2 = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navAs.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
    }
  });
}, { threshold: 0.3 });
sections.forEach(s => observer2.observe(s));

// Markdown export
const MD = ${markdownStr};
document.getElementById('export-btn').addEventListener('click', () => {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([MD], {type:'text/markdown'})),
    download: 'summary.md'
  });
  a.click();
});

// RAG Q&A — index is embedded inline (no fetch needed, works on file://)
let ragIndex = ${ragInline};

${TFIDF_QUERY_INLINE}

function loadRag() { return Promise.resolve(ragIndex !== null); }

document.getElementById('rag-ask').addEventListener('click', async () => {
  const q = document.getElementById('rag-q').value.trim();
  if (!q) return;
  const btn = document.getElementById('rag-ask');
  btn.textContent = '…';
  btn.disabled = true;

  const ok = await loadRag();
  const answerEl = document.getElementById('rag-answer');
  const textEl = document.getElementById('rag-answer-text');
  const srcEl = document.getElementById('rag-answer-source');

  if (!ok || !ragIndex) {
    textEl.textContent = 'Search index not available for this episode.';
    srcEl.textContent = '';
    answerEl.style.display = 'block';
  } else {
    const results = clientQuery(ragIndex, q, 5);
    const MIN_SCORE = 0.08;
    const good = results.filter(r => r.score >= MIN_SCORE);
    if (!good.length) {
      textEl.textContent = "This topic doesn't appear to be covered in this episode.";
      srcEl.textContent = '';
    } else {
      // Extract the most query-relevant sentences from the top results
      const stop = new Set('a an the and or but in on at to for of with is are was were be been have has do does did will would could should may might not no it its this that i you'.split(' '));
      function tok(t) { return (t.toLowerCase().match(/[a-z]+/g)||[]).filter(w=>!stop.has(w)&&w.length>2); }
      const qTerms = new Set(tok(q));
      function scoreSentence(s) {
        return tok(s).filter(w => qTerms.has(w)).length;
      }
      // Collect sentences from top 3 chunks, score each, pick best non-overlapping ones
      const allSentences = [];
      good.slice(0, 3).forEach(r => {
        r.text.split(/(?<=[.!?])\\s+/).forEach(s => {
          if (s.split(/\\s+/).length > 6) allSentences.push({ s: s.trim(), score: scoreSentence(s), chapter: r.chapter });
        });
      });
      allSentences.sort((a, b) => b.score - a.score);
      const seen = new Set();
      const picked = [];
      for (const item of allSentences) {
        if (picked.length >= 4) break;
        const key = item.s.slice(0, 40);
        if (!seen.has(key)) { seen.add(key); picked.push(item); }
      }
      // Fall back to first chunk's text if no sentence scored
      const excerpt = picked.length
        ? picked.map(p => p.s).join(' ')
        : good[0].text.slice(0, 600);
      textEl.textContent = excerpt;
      const chapters = [...new Set((picked.length ? picked : good.slice(0,1)).map(r => r.chapter))];
      srcEl.textContent = 'From: ' + chapters.join(' · ');
    }
    answerEl.style.display = 'block';
  }

  btn.textContent = 'Ask';
  btn.disabled = false;
});

document.getElementById('rag-q').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('rag-ask').click();
});

// D3 Knowledge Graph
window.addEventListener('load', function() {
  const data = ${graphData};
  const frame = document.querySelector('.kg-frame');
  if (!data.nodes?.length) {
    frame.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#333;font-size:.95rem;padding:24px;text-align:center">No knowledge graph was generated for this summary.</div>';
    return;
  }

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const W = frame.clientWidth, H = frame.clientHeight;
    const svg = d3.select('#kg-svg').attr('width', W).attr('height', H)
      .attr('viewBox', \`0 0 \${W} \${H}\`).attr('preserveAspectRatio', 'xMidYMid meet');

    const maxCh = d3.max(data.nodes, n => (n.chapters || []).length) || 1;
    const color = d3.scaleSequential().domain([0, maxCh]).interpolator(d3.interpolate('#2a4a4a', '#ff6b4a'));
    const nodes = data.nodes.map(d => ({ ...d }));
    const nodeIds = new Set(nodes.map(n => n.id));
    const links = (data.edges || [])
      .filter(e => e.from !== e.to && nodeIds.has(e.from) && nodeIds.has(e.to))
      .map(e => ({ source: e.from, target: e.to, label: e.label || '' }));

    const defs = svg.append('defs');
    defs.append('marker').attr('id', 'arr').attr('markerWidth', 8).attr('markerHeight', 8)
      .attr('refX', 34).attr('refY', 3).attr('orient', 'auto')
      .append('path').attr('d', 'M0,0 L0,6 L8,3 z').attr('fill', '#2a4a4a');

    const zoomLayer = svg.append('g');
    const linkG = zoomLayer.append('g').selectAll('g').data(links).join('g');
    const nodeG = zoomLayer.append('g').selectAll('g').data(nodes).join('g').attr('class', 'node');

    const nc = nodes.length;
    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(nc > 20 ? 110 : 140))
      .force('charge', d3.forceManyBody().strength(nc > 20 ? -300 : -420))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide(52));

    linkG.append('line').attr('stroke', '#2a4a4a').attr('stroke-width', 1.5).attr('marker-end', 'url(#arr)');
    const edgeLbl = linkG.append('text').attr('class', 'edge-label').attr('text-anchor', 'middle')
      .text(d => d.label).style('opacity', 0);
    linkG.on('mouseenter', function() { d3.select(this).select('text').style('opacity', 1); })
         .on('mouseleave', function() { d3.select(this).select('text').style('opacity', 0); });

    const tooltip = document.getElementById('tooltip');
    const zoom = d3.zoom().scaleExtent([0.08, 4])
      .on('zoom', e => { zoomLayer.attr('transform', e.transform); });
    svg.call(zoom).on('dblclick.zoom', null);

    nodeG.call(d3.drag()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }))
      .on('click', (e, d) => {
        document.querySelectorAll('.ch-section').forEach(el => el.classList.remove('highlight'));
        let first = null;
        document.querySelectorAll('.ch-section[data-concepts]').forEach(el => {
          if (el.dataset.concepts.split(',').includes(d.id)) { el.classList.add('highlight'); if (!first) first = el; }
        });
        if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })
      .on('mouseover', (e, d) => { tooltip.style.display = 'block'; tooltip.innerHTML = \`<strong>\${d.label}</strong><br>\${d.description || ''}\`; })
      .on('mousemove', e => { tooltip.style.left = (e.clientX + 14) + 'px'; tooltip.style.top = (e.clientY - 10) + 'px'; })
      .on('mouseleave', () => { tooltip.style.display = 'none'; });

    nodeG.append('circle').attr('r', 30)
      .attr('fill', d => color((d.chapters || []).length))
      .attr('stroke', '#182828').attr('stroke-width', 2);
    nodeG.append('text').attr('text-anchor', 'middle').each(function(d) {
      const sel = d3.select(this);
      const words = d.label.split(/\\s+/);
      if (words.length <= 1 || d.label.length <= 11) {
        const lbl = d.label.length > 16 ? d.label.slice(0, 15) + '…' : d.label;
        sel.append('tspan').attr('x', 0).attr('dy', '4px').attr('font-size', '10px').attr('font-weight', '700').attr('fill', '#eee').text(lbl);
      } else {
        const mid = Math.ceil(words.length / 2);
        const l1 = words.slice(0, mid).join(' ');
        const l2 = words.slice(mid).join(' ');
        sel.append('tspan').attr('x', 0).attr('dy', '-5px').attr('font-size', '10px').attr('font-weight', '700').attr('fill', '#eee').text(l1.length > 14 ? l1.slice(0, 13) + '…' : l1);
        sel.append('tspan').attr('x', 0).attr('dy', '13px').attr('font-size', '10px').attr('font-weight', '700').attr('fill', '#eee').text(l2.length > 14 ? l2.slice(0, 13) + '…' : l2);
      }
    });

    function graphBounds() {
      const pts = [];
      nodes.forEach(n => { if (Number.isFinite(n.x) && Number.isFinite(n.y)) { pts.push([n.x-54,n.y-54],[n.x+54,n.y+54]); } });
      links.forEach(l => { const sx=l.source?.x,sy=l.source?.y,tx=l.target?.x,ty=l.target?.y; if([sx,sy,tx,ty].every(Number.isFinite)){pts.push([sx,sy],[tx,ty]);} });
      if (!pts.length) return null;
      const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
      return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
    }

    function fitGraph(animated) {
      const fw=frame.clientWidth,fh=frame.clientHeight;
      if(!fw||!fh) return;
      const b=graphBounds();
      if(!b||b.width<=0||b.height<=0) return;
      const pad=56,scale=Math.max(0.08,Math.min(1.6,Math.min((fw-pad*2)/b.width,(fh-pad*2)/b.height)));
      const tx=(fw/2)-scale*(b.x+b.width/2),ty=(fh/2)-scale*(b.y+b.height/2);
      const t=d3.zoomIdentity.translate(tx,ty).scale(scale);
      (animated?svg.transition().duration(280):svg).call(zoom.transform,t);
    }

    document.getElementById('kg-zoom-in').addEventListener('click', () => svg.transition().duration(180).call(zoom.scaleBy, 1.2));
    document.getElementById('kg-zoom-out').addEventListener('click', () => svg.transition().duration(180).call(zoom.scaleBy, 1/1.2));
    document.getElementById('kg-reset').addEventListener('click', () => fitGraph(true));

    sim.stop();
    for (let i = 0; i < 300; ++i) sim.tick();
    const cx=frame.clientWidth/2,cy=frame.clientHeight/2;
    nodes.forEach(n => { if(!Number.isFinite(n.x)) n.x=cx+(Math.random()-.5)*180; if(!Number.isFinite(n.y)) n.y=cy+(Math.random()-.5)*180; });

    function updatePositions() {
      linkG.select('line').attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
      edgeLbl.attr('x',d=>(d.source.x+d.target.x)/2).attr('y',d=>(d.source.y+d.target.y)/2-6);
      nodeG.attr('transform',d=>\`translate(\${d.x},\${d.y})\`);
    }
    updatePositions();
    fitGraph(false);
    sim.on('tick', updatePositions);
    new ResizeObserver(() => { const nw=frame.clientWidth,nh=frame.clientHeight; if(!nw||!nh) return; svg.attr('width',nw).attr('height',nh).attr('viewBox',\`0 0 \${nw} \${nh}\`); fitGraph(false); }).observe(frame);
  }));
});
</script>
</body>
</html>`;
}
