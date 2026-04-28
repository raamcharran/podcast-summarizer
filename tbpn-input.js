#!/usr/bin/env node
// Build JSON input for podcast-summarizer from TBPN raw transcript
// Usage: node tbpn-input.js <transcript-file> -o <output.json>

import fs from 'fs';

// The raw transcript text — timestamps are in "Starting point is HH:MM:SS" format
const rawTranscript = fs.readFileSync(process.argv[2] || 'tbpn-raw.txt', 'utf8');

// Chapter definitions from YouTube/Spotify with start timestamps
const chapterDefs = [
  { title: "Intro", startTime: "00:00:00" },
  { title: "SpaceX's Lunar Mass Driver", startTime: "00:01:22" },
  { title: "𝕏 Timeline Reactions", startTime: "00:41:12" },
  { title: "AI Coming for Zuck's Job", startTime: "00:54:37" },
  { title: "The Great Peptide Debate w/ Martin Shkreli & Max Marchione", startTime: "00:58:17" },
  { title: "Mitchell Green — Lead Edge Capital ($3.5B Fund 7)", startTime: "01:31:35" },
  { title: "Shane Hegde — Air (Creative Operations Platform)", startTime: "01:43:28" },
  { title: "Dr. Adam Oskowitz — Doctronic (AI Doctor)", startTime: "01:52:53" },
  { title: "Robin Vince — BNY Mellon (America's Oldest Bank + AI)", startTime: "02:00:16" },
  { title: "David Senra — Founders Podcast", startTime: "02:17:26" },
];

// Parse timestamp to seconds
function tsToSeconds(ts) {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

// Extract transcript blocks: each block has a timestamp and text
const blocks = [];
const blockRegex = /Starting point is (\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*\n([\s\S]*?)(?=Starting point is \d{2}:\d{2}:\d{2}|$)/g;
let match;
while ((match = blockRegex.exec(rawTranscript)) !== null) {
  const ts = match[1].split('.')[0]; // strip sub-seconds
  const text = match[2].trim();
  if (text) {
    blocks.push({ ts, seconds: tsToSeconds(ts), text });
  }
}

console.log(`Found ${blocks.length} transcript blocks`);

// Build full transcript (clean, no timestamps)
const fullTranscript = blocks.map(b => b.text).join('\n\n');

// Split blocks into chapters
const chapters = chapterDefs.map((def, i) => {
  const startSec = tsToSeconds(def.startTime);
  const endSec = i + 1 < chapterDefs.length ? tsToSeconds(chapterDefs[i + 1].startTime) : Infinity;

  const chapterBlocks = blocks.filter(b => b.seconds >= startSec && b.seconds < endSec);
  const text = chapterBlocks.map(b => b.text).join('\n\n');

  return {
    title: def.title,
    text,
    speakerMap: {},
  };
}).filter(ch => ch.text.length > 0);

console.log(`Built ${chapters.length} chapters:`);
chapters.forEach((ch, i) => {
  const words = ch.text.split(/\s+/).length;
  console.log(`  ${i + 1}. ${ch.title} (${words} words)`);
});

const output = {
  sourceUrl: "https://www.youtube.com/watch?v=oGBCUCJHPDQ",
  episodeUrl: "https://www.youtube.com/watch?v=oGBCUCJHPDQ",
  title: "The Great Peptide Debate, SpaceX's Lunar Mass Driver, AI Coming for Zuck's Job",
  podcast_name: "TBPN Live",
  host: "John & Jordi",
  guest: "Martin Shkreli, Max Marchione, Mitchell Green, Shane Hegde, Dr. Adam Oskowitz, Robin Vince, David Senra",
  date: "2026-03-23",
  transcript: fullTranscript,
  speakerMap: {},
  chapters,
};

const outFile = process.argv[3] === '-o' ? process.argv[4] : 'tbpn-episode.json';
fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8');
console.log(`\nWritten to ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
