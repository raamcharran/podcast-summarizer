// Run logger — records pipeline steps, timings, critic retries, eval scores
// Writes output/<slug>.log.json at the end of the run
import fs from 'fs';
import path from 'path';

export function createLogger(slug, outputDir = 'output') {
  const startTime = Date.now();
  const entries = [];
  const warnings = [];

  function step(name, data = {}) {
    const entry = {
      step: name,
      ts: new Date().toISOString(),
      elapsed_ms: Date.now() - startTime,
      ...data,
    };
    entries.push(entry);
    const label = data.chapter ? `[${data.chapter}/${data.total || '?'}]` : '';
    console.log(`  [${String(Date.now() - startTime).padStart(5)}ms] ${label} ${name}`);
  }

  function warn(name, data = {}) {
    const entry = { warning: name, ts: new Date().toISOString(), ...data };
    warnings.push(entry);
    console.warn(`  [warn] ${name}`, data);
  }

  function write(url) {
    const logPath = path.join(outputDir, `${slug}.log.json`);
    const log = {
      url,
      slug,
      timestamp: new Date().toISOString(),
      total_ms: Date.now() - startTime,
      steps: entries,
      warnings,
    };
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf8');
    return logPath;
  }

  return { step, warn, write };
}
