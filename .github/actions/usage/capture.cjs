const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const events = new Map();
const costs = new Map();
const diagnostics = [];
const repo = process.env.GITHUB_REPOSITORY || 'local';
const run = process.env.GITHUB_RUN_ID || 'manual';
const attempt = process.env.GITHUB_RUN_ATTEMPT || '1';
const job = process.env.GITHUB_JOB || 'job';
const capture = new Date().toISOString();
const count = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
function record(row) {
  const message = row.message;
  if (row.type !== 'assistant' || !message?.id || !message.usage || !message.model) return;
  const usage = message.usage;
  const key = `${message.id}:${row.requestId || ''}`;
  function add(u, model, suffix = '') {
    const id = crypto.createHash('sha256').update(`${repo}:${run}:${attempt}:${job}:${key}${suffix}`).digest('hex');
    const previous = events.get(id);
    const event = {
      id: `github:${id}`, timestamp: row.timestamp || capture, harness: 'claude', model,
      project: `github:${repo}`, repository: `https://github.com/${repo}`,
      sessionId: `github:${run}:${attempt}:${job}:${row.sessionId || row.session_id || 'session'}`,
      sessionTitle: `${process.env.GITHUB_WORKFLOW || job} #${run}`,
      projectName: repo, inputTokens: count(u.input_tokens), outputTokens: count(u.output_tokens),
      cacheReadTokens: count(u.cache_read_input_tokens), cacheWriteTokens: count(u.cache_creation_input_tokens),
      cacheWrite1hTokens: count(u.cache_creation?.ephemeral_1h_input_tokens),
      reasoningTokens: count(u.output_tokens_details?.thinking_tokens), costUsd: 0, costKnown: false,
      ...(u.service_tier ? {serviceTier: u.service_tier} : {}),
    };
    if (!previous || event.outputTokens >= previous.outputTokens) events.set(id, event);
  }
  add(usage, message.model);
  let advisor = 0;
  for (const u of usage.iterations || []) if (u.type === 'advisor_message') {
    const slot = advisor++;
    if (u.model) add(u, u.model, `:advisor:${slot}`);
  }
}
function files(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => e.isDirectory() ? files(path.join(dir,e.name)) : e.isFile() && e.name.endsWith('.jsonl') ? [path.join(dir,e.name)] : []);
}
const roots = (process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')).split(',');
let fileCount = 0;
for (const root of roots) for (const file of files(path.join(root, 'projects'))) {
  fileCount++;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { record(JSON.parse(line)); } catch { diagnostics.push('An incomplete transcript record was skipped'); }
  }
}
const executionFiles = [...new Set([process.env.TOKENHUB_EXECUTION_FILE || '',
  ...(process.env.TOKENHUB_EXECUTION_FILES || '').split('\n')].map(f => f.trim()).filter(Boolean))];
// Transcript counters already cover native results from this job. Avoid counting both representations.
if (!events.size) {
  const results = new Map();
  for (const file of executionFiles) {
    if (!fs.existsSync(file)) continue;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      let rows;
      try { const parsed = JSON.parse(raw); rows = Array.isArray(parsed) ? parsed : [parsed]; }
      catch { rows = raw.split('\n').filter(l => l.trim()).map(l => JSON.parse(l)); }
      const finals = rows.filter(r => r.type === 'result' && r.modelUsage);
      const anonymous = finals.filter(r => !r.session_id);
      if (new Set(anonymous.map(r => JSON.stringify(r.modelUsage))).size > 1) {
        diagnostics.push('Multiple anonymous result sessions could not be safely combined');
        continue;
      }
      for (const result of finals) {
        const key = result.session_id || file;
        results.set(key, result); // Native results are cumulative within a session.
      }
    } catch { diagnostics.push('Execution accounting could not be read'); }
  }
  for (const [session, result] of results) {
    const sid = crypto.createHash('sha256').update(session).digest('hex');
    let missing = false;
    let measured = 0;
    for (const [model, usage] of Object.entries(result.modelUsage)) {
      const fields = ['inputTokens', 'outputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens'];
      if (!usage || !fields.every(f => Number.isSafeInteger(usage[f]) && usage[f] >= 0)) {
        missing = true;
        continue;
      }
      const id = `github:${repo}:${run}:${attempt}:${job}:${sid}:${model}`;
      const reported = Number.isFinite(usage.costUSD) && usage.costUSD >= 0;
      measured++;
      events.set(id, {id, timestamp: capture, harness:'claude', model, project:`github:${repo}`,
        repository:`https://github.com/${repo}`, sessionId:`github:${run}:${attempt}:${job}:${sid}`,
        sessionTitle:`${process.env.GITHUB_WORKFLOW || job} #${run}`, projectName:repo,
        inputTokens:usage.inputTokens,outputTokens:usage.outputTokens,
        cacheReadTokens:usage.cacheReadInputTokens,cacheWriteTokens:usage.cacheCreationInputTokens,
        reasoningTokens:0,costUsd:reported?usage.costUSD:0, costKnown:reported,
        ...(reported?{reportedCostUsd:usage.costUSD}:{}),
      });
    }
    if (missing) {
      diagnostics.push('Final token counters were omitted');
      if (!measured && Number.isFinite(result.total_cost_usd) && result.total_cost_usd >= 0)
        costs.set(sid, {id:sid, costUSD:result.total_cost_usd, models:Object.keys(result.modelUsage)});
    }
  }
}
const out = process.env.TOKENHUB_USAGE_FILE || path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'claude-usage.json');
const document = {version:1, repository:repo, runId:run, attempt, job, capturedAt:capture,
  account:process.env.TOKENHUB_ACCOUNT_ID || 'unverified-repository-secret',
  workflowName:process.env.GITHUB_WORKFLOW || job,
  workflowPath:(process.env.GITHUB_WORKFLOW_REF || '').split('@')[0].replace(`${repo}/`, ''),
  coverage:events.size?'measured':costs.size?'cost-only':'no-accounting-records', fileCount,
  diagnostics:[...new Set(diagnostics)], events:[...events.values()], costs:[...costs.values()]};
fs.writeFileSync(out, JSON.stringify(document), {mode:0o600});
console.log(`Saved ${events.size} accounting records; prompts, replies and credentials were excluded.`);
