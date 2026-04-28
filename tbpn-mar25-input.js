#!/usr/bin/env node
import fs from 'fs';

const rawTranscript = fs.readFileSync(process.argv[2] || 'tbpn-mar25-raw.txt', 'utf8');

// Diet TBPN - derive chapters from content since no official chapters exist
const chapterDefs = [
  { title: "The Benchmark Ship of Theseus", startTime: "00:00:00" },
  { title: "OpenAI Kills Sora — RIP to the App", startTime: "00:10:40" },
  { title: "AI Video: Sora, VO3, Fruit Love Island & the Compute Allocation Question", startTime: "00:12:35" },
  { title: "Fiverr's 'AI Directors' Billboard & the Disintermediation Problem", startTime: "00:21:02" },
  { title: "United Airlines Relax Row vs. Private Jets", startTime: "00:25:59" },
  { title: "SpaceX IPO Filing — Could It Be 4/20?", startTime: "00:28:45" },
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
  sourceUrl: "https://www.youtube.com/watch?v=c1v3bw-TQWE",
  episodeUrl: "https://www.youtube.com/watch?v=c1v3bw-TQWE",
  title: "Benchmark's Ship of Theseus, OpenAI Kills Sora, SpaceX $2T IPO Buzz | Diet TBPN",
  podcast_name: "TBPN Live (Diet)",
  host: "John & Jordi",
  guest: "",
  date: "2026-03-25",
  transcript: fullTranscript,
  speakerMap: {},
  chapters,
};

const outFile = process.argv[3] === '-o' ? process.argv[4] : 'tbpn-mar25-episode.json';
fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8');
console.log(`\nWritten to ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
