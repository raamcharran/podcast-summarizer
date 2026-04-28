#!/usr/bin/env node
/**
 * Converts SRT subtitle file to "Starting point is HH:MM:SS" format.
 * Merges consecutive subtitle lines into ~30-second paragraph blocks.
 * Strips ">>" speaker markers and deduplicates overlapping text.
 */
import fs from 'fs';

const srtFile = process.argv[2];
const outFile = process.argv[3] || srtFile.replace('.srt', '-raw.txt');
const BLOCK_INTERVAL = 30; // seconds per block

const raw = fs.readFileSync(srtFile, 'utf8');

// Parse SRT entries
const entries = [];
const srtRegex = /(\d+)\r?\n(\d{2}:\d{2}:\d{2}),\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}\r?\n([\s\S]*?)(?=\r?\n\r?\n\d+\r?\n|\r?\n*$)/g;
let m;
while ((m = srtRegex.exec(raw)) !== null) {
  const ts = m[2]; // HH:MM:SS
  let text = m[3].trim()
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/>>\s*/g, '')  // strip >> speaker markers
    .trim();
  if (text) entries.push({ ts, text });
}

console.log(`Parsed ${entries.length} SRT entries`);

function tsToSeconds(ts) {
  const parts = ts.split(':').map(Number);
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

// Merge into blocks at BLOCK_INTERVAL boundaries
const blocks = [];
let currentBlockStart = null;
let currentTexts = [];

for (const entry of entries) {
  const sec = tsToSeconds(entry.ts);
  const blockStart = Math.floor(sec / BLOCK_INTERVAL) * BLOCK_INTERVAL;

  if (currentBlockStart === null || blockStart !== currentBlockStart) {
    if (currentBlockStart !== null && currentTexts.length > 0) {
      blocks.push({ seconds: currentBlockStart, texts: [...currentTexts] });
    }
    currentBlockStart = blockStart;
    currentTexts = [entry.text];
  } else {
    currentTexts.push(entry.text);
  }
}
if (currentBlockStart !== null && currentTexts.length > 0) {
  blocks.push({ seconds: currentBlockStart, texts: [...currentTexts] });
}

console.log(`Merged into ${blocks.length} blocks`);

// Deduplicate overlapping text fragments within each block
function dedupeTexts(texts) {
  // SRT often has overlapping fragments. Join them and remove repeated substrings.
  let merged = '';
  for (const t of texts) {
    // Check if this text overlaps with the end of merged
    let bestOverlap = 0;
    for (let i = 1; i <= Math.min(t.length, merged.length); i++) {
      if (merged.endsWith(t.substring(0, i))) {
        bestOverlap = i;
      }
    }
    merged += ' ' + t.substring(bestOverlap);
  }
  return merged.trim().replace(/\s+/g, ' ');
}

// Format output
function secsToTs(s) {
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

const lines = [];
for (const block of blocks) {
  const text = dedupeTexts(block.texts);
  if (text.length < 3) continue; // skip near-empty blocks
  lines.push(`Starting point is ${secsToTs(block.seconds)}`);
  lines.push(text);
}

fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');
console.log(`Written to ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
