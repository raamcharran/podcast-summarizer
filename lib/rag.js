// Pure-JS TF-IDF RAG — no external dependencies
// Port of the Python implementation, validated on large non-fiction books

const STOP_WORDS = new Set(
  'a an the and or but in on at to for of with is are was were be been being ' +
  'have has had do does did will would could should may might shall not no nor ' +
  'it its this that these those he she we they them their i you your my ' +
  'from by up out if as so into than then also more very just about when ' +
  'where how what which who'.split(' ')
);

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z]+/g) || [])
    .filter(w => !STOP_WORDS.has(w) && w.length > 2);
}

function chunkText(text, chapterTitle, chunkSize = 400, overlap = 50) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let i = 0, id = 0;
  while (i < words.length) {
    const slice = words.slice(i, i + chunkSize);
    chunks.push({ chapter: chapterTitle, chunkId: id++, text: slice.join(' '), wordCount: slice.length });
    i += chunkSize - overlap;
  }
  return chunks;
}

function buildVector(tokens, idf) {
  const tf = {};
  const total = Math.max(tokens.length, 1);
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  const vec = {};
  for (const [t, cnt] of Object.entries(tf)) {
    if (idf[t] != null) vec[t] = (cnt / total) * idf[t];
  }
  const norm = Math.sqrt(Object.values(vec).reduce((s, v) => s + v * v, 0)) || 1;
  for (const t in vec) vec[t] /= norm;
  return vec;
}

function cosine(a, b) {
  let dot = 0;
  for (const [t, v] of Object.entries(a)) { if (b[t]) dot += v * b[t]; }
  return dot;
}

// Build a serialisable index from an array of {title, text} chapters
export function buildIndex(chapters) {
  const allChunks = [];
  for (const ch of chapters) allChunks.push(...chunkText(ch.text, ch.title));

  const tokenizedCorpus = allChunks.map(c => tokenize(c.text));
  const N = allChunks.length;

  const df = {};
  for (const tokens of tokenizedCorpus) {
    for (const t of new Set(tokens)) df[t] = (df[t] || 0) + 1;
  }

  const idf = {};
  for (const [t, freq] of Object.entries(df)) {
    idf[t] = Math.log((N + 1) / (freq + 1)) + 1;
  }

  const vectors = tokenizedCorpus.map(tokens => buildVector(tokens, idf));

  return {
    chunks: allChunks,
    idf,
    vectors,
    meta: { totalChunks: N, vocabSize: Object.keys(idf).length },
  };
}

// Query a loaded index. Returns top-k chunks sorted by score descending.
export function query(index, queryStr, topK = 5) {
  const { chunks, idf, vectors } = index;
  const qVec = buildVector(tokenize(queryStr), idf);
  return vectors
    .map((vec, i) => ({ ...chunks[i], score: cosine(qVec, vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// Retrieve the most relevant chunks for a chapter — used to focus API prompts
export function retrieveForChapter(index, chapterTitle, extraQuery = '', topK = 6) {
  const results = query(index, `${chapterTitle} ${extraQuery}`, topK * 3);
  // Prefer chunks from the chapter itself, then fill from elsewhere
  const own   = results.filter(r => r.chapter === chapterTitle).slice(0, topK);
  const other = results.filter(r => r.chapter !== chapterTitle).slice(0, Math.max(0, topK - own.length));
  return [...own, ...other].slice(0, topK);
}
