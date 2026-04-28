#!/usr/bin/env node
import fs from 'fs';

const rawTranscript = fs.readFileSync(process.argv[2] || 'tbpn-mar25-full-raw.txt', 'utf8');

// YouTube chapters from https://www.youtube.com/watch?v=gRPxyeM4Xzo
const chapterDefs = [
  { title: "Intro", startTime: "00:00:00" },
  { title: "The Benchmark Ship of Theseus", startTime: "00:00:52" },
  { title: "OpenAI Kills Sora", startTime: "00:13:15" },
  { title: "Fiverr's AI Directors Campaign", startTime: "00:25:48" },
  { title: "United Airlines Relax Row & Elon's Minivan Tease", startTime: "00:32:46" },
  { title: "AI Naming Wars & QVC Streaming", startTime: "00:40:08" },
  { title: "SpaceX IPO Filing", startTime: "00:43:10" },
  { title: "Manus Founder Stuck in China", startTime: "00:51:54" },
  { title: "Meek Mill's AI Workflow", startTime: "00:56:52" },
  { title: "Mike Knoop — ARC AGI V3 Launch", startTime: "00:59:37" },
  { title: "Nathan Benaich — Air Street Capital", startTime: "01:22:33" },
  { title: "Rohin Dhar — SF Real Estate", startTime: "01:35:31" },
  { title: "Eric Jorgenson — The Book of Elon", startTime: "01:46:44" },
  { title: "Jenny Just & Matt Hulsizer — PEAK6 Investments", startTime: "02:00:37" },
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

// Skip "Intro" chapter (index 0) — it's just the cold open / ads
const contentChapters = chapterDefs.slice(1);

const chapters = contentChapters.map((def, i) => {
  const startSec = tsToSeconds(def.startTime);
  const endSec = i + 1 < contentChapters.length ? tsToSeconds(contentChapters[i + 1].startTime) : Infinity;
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
  sourceUrl: "https://www.youtube.com/watch?v=gRPxyeM4Xzo",
  episodeUrl: "https://www.youtube.com/watch?v=gRPxyeM4Xzo",
  title: "Benchmark's Future, ARC-AGI, SpaceX IPO, RIP Sora, Manus Founder Stuck in China",
  podcast_name: "TBPN Live",
  host: "John & Jordi",
  guest: "Mike Knoop, Nathan Benaich, Rohin Dhar, Eric Jorgenson, Jenny Just, Matt Hulsizer",
  date: "2026-03-25",
  transcript: fullTranscript,
  speakerMap: {},
  chapters,
};

const outFile = process.argv[3] === '-o' ? process.argv[4] : 'tbpn-mar25-full-episode.json';
fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8');
console.log(`\nWritten to ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
