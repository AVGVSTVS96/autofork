const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const events = new Map();
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
const execution = process.env.TOKENHUB_EXECUTION_FILE;
if (!events.size && execution && fs.existsSync(execution)) {
  try {
    const rows = JSON.parse(fs.readFileSync(execution, 'utf8'));
    const result = rows.findLast(r => r.type === 'result' && r.modelUsage);
    if (result) for (const [model, usage] of Object.entries(result.modelUsage)) {
      const id = `github:${repo}:${run}:${attempt}:${job}:${model}`;
      events.set(id, {id, timestamp: capture, harness:'claude', model, project:`github:${repo}`,
        repository:`https://github.com/${repo}`, sessionId:`github:${run}:${attempt}:${job}`,
        sessionTitle:`${process.env.GITHUB_WORKFLOW || job} #${run}`, projectName:repo,
        inputTokens:count(usage.inputTokens),outputTokens:count(usage.outputTokens),
        cacheReadTokens:count(usage.cacheReadInputTokens),cacheWriteTokens:count(usage.cacheCreationInputTokens),
        reasoningTokens:0,costUsd:typeof usage.costUSD==='number'?usage.costUSD:0,
        costKnown:typeof usage.costUSD==='number',...(typeof usage.costUSD==='number'?{reportedCostUsd:usage.costUSD}:{}),
      });
    }
  } catch { diagnostics.push('Execution accounting could not be read'); }
}
const out = process.env.TOKENHUB_USAGE_FILE || path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'claude-usage.json');
const document = {version:1, repository:repo, runId:run, attempt, job, capturedAt:capture,
  account:process.env.TOKENHUB_ACCOUNT_ID || 'unverified-repository-secret',
  coverage:events.size?'measured':'no-accounting-records', fileCount,
  diagnostics:[...new Set(diagnostics)], events:[...events.values()]};
fs.writeFileSync(out, JSON.stringify(document), {mode:0o600});
console.log(`Saved ${events.size} accounting records; prompts, replies and credentials were excluded.`);
