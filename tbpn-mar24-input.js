#!/usr/bin/env node
// Build JSON input for TBPN Mar 24 episode
import fs from 'fs';

const rawTranscript = fs.readFileSync(process.argv[2] || 'tbpn-mar24-raw.txt', 'utf8');

// 16 chapters from Spotify
const chapterDefs = [
  { title: "Intro", startTime: "00:00:00" },
  { title: "Who Won The Great Peptide Debate", startTime: "00:06:46" },
  { title: "Ternus Steps Into Apple Spotlight", startTime: "00:13:57" },
  { title: "TBPN Featured in Fast Company", startTime: "00:34:12" },
  { title: "OpenAI's Non-Profit to Spend $1B in 2026", startTime: "00:39:11" },
  { title: "𝕏 Timeline Reactions (1)", startTime: "00:40:59" },
  { title: "Chase Lochmiller — Crusoe (AI Infrastructure)", startTime: "00:50:52" },
  { title: "Ryan Petersen — Flexport (Tariffs & AI)", startTime: "01:06:04" },
  { title: "𝕏 Timeline Reactions (2)", startTime: "01:20:49" },
  { title: "Scott Nolan — General Matter (Nuclear Enrichment)", startTime: "01:23:28" },
  { title: "Sarah Guo — Conviction (NeoLabs & AI Deployment)", startTime: "01:35:19" },
  { title: "𝕏 Timeline Reactions (3)", startTime: "01:48:41" },
  { title: "Casey Handmer — Terraform Industries (Synthetic Fuel)", startTime: "01:55:39" },
  { title: "Shaun Maguire — Sequoia (Hardware Manifesto & Mass Drivers)", startTime: "02:04:42" },
  { title: "𝕏 Timeline Reactions (4)", startTime: "02:19:09" },
  { title: "Delian Asparouhov — Founders Fund (Space & Varda)", startTime: "02:24:13" },
  { title: "Zach Dell — Base Power (Battery Storage)", startTime: "02:36:44" },
];

function tsToSeconds(ts) {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

const blocks = [];
const blockRegex = /Starting point is (\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*\n([\s\S]*?)(?=Starting point is \d{2}:\d{2}:\d{2}|$)/g;
let match;
while ((match = blockRegex.exec(rawTranscript)) !== null) {
  const ts = match[1].split('.')[0];
  const text = match[2].trim();
  if (text) blocks.push({ ts, seconds: tsToSeconds(ts), text });
}
console.log(`Found ${blocks.length} transcript blocks`);

const fullTranscript = blocks.map(b => b.text).join('\n\n');

const chapters = chapterDefs.map((def, i) => {
  const startSec = tsToSeconds(def.startTime);
  const endSec = i + 1 < chapterDefs.length ? tsToSeconds(chapterDefs[i + 1].startTime) : Infinity;
  const chapterBlocks = blocks.filter(b => b.seconds >= startSec && b.seconds < endSec);
  const text = chapterBlocks.map(b => b.text).join('\n\n');
  return { title: def.title, text, speakerMap: {} };
}).filter(ch => ch.text.length > 0);

console.log(`Built ${chapters.length} chapters:`);
chapters.forEach((ch, i) => {
  const words = ch.text.split(/\s+/).length;
  console.log(`  ${i + 1}. ${ch.title} (${words} words)`);
});

const output = {
  sourceUrl: "https://open.spotify.com/episode/13ORFnA5N44osPMHULVtAC",
  episodeUrl: "https://open.spotify.com/episode/13ORFnA5N44osPMHULVtAC",
  title: "Hill & Valley Gigastream, Apple's Next CEO, OpenAI's Non-Profit",
  podcast_name: "TBPN Live",
  host: "John & Jordi",
  guest: "Scott Nolan, Sarah Guo, Casey Handmer, Shaun Maguire, Delian Asparouhov, Zach Dell, Ryan Petersen, Chase Lochmiller",
  date: "2026-03-24",
  transcript: fullTranscript,
  speakerMap: {},
  chapters,
};

const outFile = process.argv[3] === '-o' ? process.argv[4] : 'tbpn-mar24-episode.json';
fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8');
console.log(`\nWritten to ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
