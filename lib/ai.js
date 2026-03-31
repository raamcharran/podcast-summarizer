import { spawn } from 'child_process';

function normalizeProvider(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function detectProvider(env = process.env) {
  const explicit = normalizeProvider(env.AI_PROVIDER);
  if (explicit) return explicit;
  if (env.OPENAI_API_KEY) return env.OPENAI_BASE_URL ? 'openai-compatible' : 'openai';
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'claude-cli';
}

function defaultModel(provider) {
  switch (provider) {
    case 'anthropic':
      return 'claude-sonnet-4-6';
    case 'openai':
      return 'gpt-4o-mini';
    case 'openai-compatible':
      return 'gpt-4o-mini';
    case 'claude-cli':
    default:
      return 'session-default';
  }
}

export function getAiConfig(env = process.env) {
  const timeout = Number(env.AI_TIMEOUT_MS || 300000);
  const provider = detectProvider(env);
  return {
    provider,
    model: env.AI_MODEL || defaultModel(provider),
    openAiBaseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    anthropicBaseUrl: env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
    openAiApiKey: env.OPENAI_API_KEY || '',
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 300000,
  };
}

export function describeAiConfig(config = getAiConfig()) {
  const modelPart = config.provider === 'claude-cli' ? 'Claude CLI session' : `${config.provider}:${config.model}`;
  return modelPart;
}

function joinContentParts(value) {
  if (Array.isArray(value)) {
    return value
      .map(part => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text') return part.text || '';
        if (typeof part?.text === 'string') return part.text;
        return '';
      })
      .join('');
  }
  return typeof value === 'string' ? value : '';
}

function extractOpenAiText(data) {
  const choice = data?.choices?.[0];
  const content = choice?.message?.content ?? choice?.delta?.content ?? '';
  return joinContentParts(content).trim();
}

function extractAnthropicText(data) {
  return (data?.content || [])
    .filter(part => part?.type === 'text')
    .map(part => part.text || '')
    .join('')
    .trim();
}

function buildPrompt(system, prompt) {
  return system ? `${system}\n\n${prompt}` : prompt;
}

async function callClaudeCli(prompt, config) {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill();
      reject(new Error('Claude CLI timed out'));
    }, config.timeoutMs);

    const finish = fn => value => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      fn(value);
    };

    proc.stdout.on('data', data => { out += data; });
    proc.stderr.on('data', data => { err += data; });
    proc.on('error', finish(error => reject(new Error(`Claude CLI error: ${error.message}`))));
    proc.on('close', finish(code => {
      if (code !== 0) reject(new Error(`Claude CLI exited ${code}: ${err.slice(0, 300)}`));
      else resolve(out.trim());
    }));

    proc.stdin.end(prompt, 'utf8');
  });
}

async function callAnthropic(config, system, prompt, maxTokens) {
  if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const response = await fetch(`${config.anthropicBaseUrl}/messages`, {
    method: 'POST',
    signal: AbortSignal.timeout(config.timeoutMs),
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(`Anthropic API error: ${message}`);
  }

  const text = extractAnthropicText(data);
  if (!text) throw new Error('Anthropic API returned no text');
  return text;
}

async function callOpenAiCompatible(config, system, prompt, maxTokens) {
  if (!config.openAiApiKey) throw new Error('OPENAI_API_KEY is not set');

  const response = await fetch(`${config.openAiBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(config.timeoutMs),
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      max_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(`OpenAI-compatible API error: ${message}`);
  }

  const text = extractOpenAiText(data);
  if (!text) throw new Error('OpenAI-compatible API returned no text');
  return text;
}

async function retryWithBackoff(fn, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

export async function generateText({ system = '', prompt, maxTokens = 2048, config = getAiConfig() }) {
  return retryWithBackoff(() => {
    switch (config.provider) {
      case 'claude-cli':
        return callClaudeCli(buildPrompt(system, prompt), config);
      case 'anthropic':
        return callAnthropic(config, system, prompt, maxTokens);
      case 'openai':
      case 'openai-compatible':
        return callOpenAiCompatible(config, system, prompt, maxTokens);
      default:
        throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
  });
}

function stripCodeFences(text) {
  return String(text || '')
    .replace(/^```(?:json|svg)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

export function parseJsonResponse(text) {
  const cleaned = stripCodeFences(text);
  const repairControlChars = input => {
    let out = '';
    let inString = false;
    let escaped = false;

    for (const ch of input) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        out += ch;
        escaped = true;
        continue;
      }

      if (ch === '"') {
        out += ch;
        inString = !inString;
        continue;
      }

      if (inString) {
        if (ch === '\n') { out += '\\n'; continue; }
        if (ch === '\r') { out += '\\r'; continue; }
        if (ch === '\t') { out += '\\t'; continue; }
      }

      out += ch;
    }

    return out;
  };

  try {
    return JSON.parse(cleaned);
  } catch {
    const repaired = repairControlChars(cleaned);
    try {
      return JSON.parse(repaired);
    } catch {
      const objectStart = repaired.indexOf('{');
      const objectEnd = repaired.lastIndexOf('}');
    if (objectStart !== -1 && objectEnd > objectStart) {
        return JSON.parse(repaired.slice(objectStart, objectEnd + 1));
    }

      const arrayStart = repaired.indexOf('[');
      const arrayEnd = repaired.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
        return JSON.parse(repaired.slice(arrayStart, arrayEnd + 1));
    }

      throw new Error('Could not parse JSON from model response');
    }
  }
}
