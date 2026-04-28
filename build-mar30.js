#!/usr/bin/env node
// Build JSON input for podcast-summarizer from raw Spotify transcript text
// Usage: node build-mar30.js raw-transcript.txt
import fs from 'fs';

const inputFile = process.argv[2];
if (!inputFile) { console.error('Usage: node build-mar30.js <raw-transcript.txt>'); process.exit(1); }

const raw = fs.readFileSync(inputFile, 'utf8');

// Parse raw Spotify transcript: timestamps on own lines, "Speaker N" on own lines, dialogue text
function parseRawTranscript(text) {
  const parts = text.split(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
  let currentSpeaker = 'Speaker 1';
  const lines = [];
  let prevWasTimestamp = false;
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) { prevWasTimestamp = true; continue; }
    if (!prevWasTimestamp) continue;
    prevWasTimestamp = false;
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

const transcript = parseRawTranscript(raw);

const json = {
  sourceUrl: "https://podcasts.apple.com/us/podcast/the-lawyer-who-beat-meta-and-google-revisiting/id1772360235?i=1000758296574",
  episodeUrl: "https://podcasts.apple.com/us/podcast/the-lawyer-who-beat-meta-and-google-revisiting/id1772360235?i=1000758296574",
  title: "The Lawyer Who Beat Meta and Google, Revisiting The Jetsons, Japan Twitter | Tae Kim, Logan Bartlett, Sam Stephenson, Ben Broca, Brett Adcock, Andrei Serban",
  podcast_name: "TBPN",
  host: "John Coogan & Jordi Hays",
  guest: "Tae Kim, Logan Bartlett, Sam Stephenson, Ben Broca, Brett Adcock, Andrei Serban",
  date: "2026-03-30",
  transcript,
  speakerMap: {
    "Speaker 1": "John",
    "Speaker 2": "Geordie",
    "Speaker 3": "Tyler",
    "Speaker 4": "Brett Adcock",
    "Speaker 5": "Logan Bartlett",
    "Speaker 6": "Tae Kim",
    "Speaker 7": "Sam Stephenson",
    "Speaker 8": "Ben Broca",
    "Speaker 9": "Andrei Serban"
  }
};

const outFile = inputFile.replace(/\.txt$/, '') + '-episode.json';
fs.writeFileSync(outFile, JSON.stringify(json, null, 2));
console.log(`Wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
console.log(`Transcript lines: ${transcript.split('\n').length}`);
console.log(`First 200 chars: ${transcript.slice(0, 200)}`);
