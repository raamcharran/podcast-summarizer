// Free-tier: RAG index build and query
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, query } from '../lib/rag.js';

const CHAPTERS = [
  { title: 'Economics and Markets', text: 'Supply and demand determines prices in a free market economy. Adam Smith argued that the invisible hand coordinates economic activity through price signals. Competition drives efficiency and innovation in capitalist systems.' },
  { title: 'Government Policy', text: 'Fiscal policy involves government spending and taxation decisions. Monetary policy is conducted by central banks through interest rate adjustments. Keynesian economists argue that government intervention can stabilize business cycles.' },
  { title: 'Technology and Innovation', text: 'Technological progress drives long run economic growth according to endogenous growth theory. Silicon Valley venture capital funds early stage technology companies. Artificial intelligence is transforming labor markets and productivity.' },
];

test('buildIndex returns serializable structure', () => {
  const index = buildIndex(CHAPTERS);
  assert.ok(index.chunks, 'has chunks');
  assert.ok(index.idf, 'has idf');
  assert.ok(index.vectors, 'has vectors');
  // Verify it's JSON-serializable
  const json = JSON.stringify(index);
  assert.ok(json.length > 0);
  const parsed = JSON.parse(json);
  assert.deepEqual(Object.keys(parsed), Object.keys(index));
});

test('buildIndex chunks have chapter metadata', () => {
  const index = buildIndex(CHAPTERS);
  assert.ok(index.chunks.every(c => typeof c.chapter === 'string'), 'every chunk has chapter title');
  assert.ok(index.chunks.every(c => typeof c.text === 'string'), 'every chunk has text');
});

test('query returns top-k results', () => {
  const index = buildIndex(CHAPTERS);
  const results = query(index, 'interest rates monetary policy', 3);
  assert.equal(results.length, 3);
});

test('query results are sorted by score descending', () => {
  const index = buildIndex(CHAPTERS);
  const results = query(index, 'supply demand markets', 5);
  for (let i = 0; i < results.length - 1; i++) {
    assert.ok(results[i].score >= results[i + 1].score, 'results should be sorted by score');
  }
});

test('query returns relevant chapter for economics question', () => {
  const index = buildIndex(CHAPTERS);
  const results = query(index, 'Adam Smith invisible hand free market', 1);
  assert.equal(results[0].chapter, 'Economics and Markets');
});

test('query returns relevant chapter for tech question', () => {
  const index = buildIndex(CHAPTERS);
  const results = query(index, 'artificial intelligence silicon valley', 1);
  assert.equal(results[0].chapter, 'Technology and Innovation');
});

test('buildIndex meta contains chunk count and vocab size', () => {
  const index = buildIndex(CHAPTERS);
  assert.ok(index.meta.totalChunks > 0);
  assert.ok(index.meta.vocabSize > 0);
});
