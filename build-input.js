#!/usr/bin/env node
// build-input.js — parse a raw Spotify transcript text file into episode-input.json

import fs from 'node:fs';
import path from 'node:path';

const inputFile = process.argv[2];
if (!inputFile) {
  console.error('Usage: node build-input.js <raw-transcript.txt>');
  process.exit(1);
}

/**
 * Parse raw transcript text that has timestamps and "Speaker N" labels mixed in.
 * Spotify transcripts follow this pattern:
 *   0:00 Welcome to the show... 0:18 Speaker 2 Thanks for having me...
 * We split on timestamps and reconstruct "Speaker N: text" lines.
 */
function parseRawTranscript(text) {
  if (!text) return '';

  // Split on timestamp patterns (M:SS, MM:SS, H:MM:SS)
  // Use a capture group so we keep the timestamps for boundary detection
  const parts = text.split(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);

  let currentSpeaker = 'Speaker 1';
  const lines = [];
  let prevWasTimestamp = false;

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Skip timestamp tokens
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      prevWasTimestamp = true;
      continue;
    }

    // Only process chunks that followed a timestamp (avoids grabbing nav text etc.)
    if (!prevWasTimestamp) continue;
    prevWasTimestamp = false;

    // Check if chunk starts with "Speaker N"
    const speakerMatch = trimmed.match(/^(Speaker \d+)\s+([\s\S]*)$/);
    if (speakerMatch) {
      currentSpeaker = speakerMatch[1];
      const body = speakerMatch[2].trim();
      if (body) lines.push(`${currentSpeaker}: ${body}`);
    } else {
      lines.push(`${currentSpeaker}: ${trimmed}`);
    }
  }

  return lines.join('\n');
}

// Read raw transcript
const rawText = fs.readFileSync(path.resolve(inputFile), 'utf8');
const transcript = parseRawTranscript(rawText);

console.log(`Parsed transcript: ${transcript.length} chars, ${transcript.split('\n').length} lines`);

// Build the episode JSON
const episode = {
  title: "The Lawyer Who Beat Meta and Google, Revisiting The Jetsons, Japan Twitter | Tae Kim, Logan Bartlett, Sam Stephenson, Ben Broca, Brett Adcock, Andrei Serban",
  podcast_name: "TBPN",
  host: "John Coogan & Jordi Hays",
  guest: "Tae Kim, Logan Bartlett, Sam Stephenson, Ben Broca, Brett Adcock, Andrei Serban",
  date: "2026-03-30",
  sourceUrl: "https://podcasts.apple.com/us/podcast/the-lawyer-who-beat-meta-and-google-revisiting/id1772360235?i=1000758296574",
  episodeUrl: "https://podcasts.apple.com/us/podcast/the-lawyer-who-beat-meta-and-google-revisiting/id1772360235?i=1000758296574",
  speakerMap: {
    "Speaker 1": "John",
    "Speaker 2": "Geordie",
    "Speaker 3": "Tyler",
    "Speaker 4": "Brett Adcock",
    "Speaker 5": "Logan Bartlett",
    "Speaker 6": "Tae Kim",
    "Speaker 7": "Sam Stephenson",
    "Speaker 8": "Ben Broca",
    "Speaker 9": "Andrei Serban",
  },
  transcript,
};

const outPath = path.join(path.dirname(path.resolve(inputFile)), 'episode-input.json');
fs.writeFileSync(outPath, JSON.stringify(episode, null, 2), 'utf8');
console.log(`Wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
