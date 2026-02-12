import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import Database from 'better-sqlite3';

type CliArgs = {
  dbPath: string;
  top: number;
  offset: number;
  provider: 'auto' | 'openrouter' | 'gemini';
  model: string;
  ageCoverage: 'strict' | 'balanced' | 'off';
  birthPolicy: 'forbid' | 'discourage' | 'allow';
  promptVersion: string;
  minEvents: number;
  maxEvents: number;
  maxTokens: number;
  timeoutMs: number;
  delayMs: number;
  publish: boolean;
  dryRun: boolean;
  resume: boolean;
  skipExisting: boolean;
  stopOnError: boolean;
  stateFile: string;
};

type FigureTarget = {
  id: string;
  canonicalName: string;
  llmConsensusRank: number;
};

type StateStatus = 'success' | 'error' | 'skipped_state' | 'skipped_existing';

type StateEntry = {
  ts: string;
  figureId: string;
  status: StateStatus;
  message?: string;
  attemptMs?: number;
};

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
  elapsedMs: number;
};

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const match = argv.find((arg) => arg.startsWith(`${flag}=`));
    return match ? match.slice(flag.length + 1) : null;
  };

  const dbPath = get('--db') || path.join(process.cwd(), 'historyrank.db');
  const topRaw = get('--top');
  const top = topRaw ? Number.parseInt(topRaw, 10) : 500;
  const offsetRaw = get('--offset');
  const offset = offsetRaw ? Number.parseInt(offsetRaw, 10) : 0;

  const providerRaw = get('--provider') || 'auto';
  const provider =
    providerRaw === 'auto' || providerRaw === 'openrouter' || providerRaw === 'gemini'
      ? providerRaw
      : null;
  const model = get('--model') || 'gemini-2.5-flash-lite';
  const ageCoverageRaw = get('--age-coverage') || 'strict';
  const ageCoverage =
    ageCoverageRaw === 'strict' || ageCoverageRaw === 'balanced' || ageCoverageRaw === 'off'
      ? ageCoverageRaw
      : null;
  const birthPolicyRaw = get('--birth-policy') || 'forbid';
  const birthPolicy =
    birthPolicyRaw === 'forbid' || birthPolicyRaw === 'discourage' || birthPolicyRaw === 'allow'
      ? birthPolicyRaw
      : null;
  const promptVersion = get('--prompt-version') || 'timeline_events_v6';

  const minEventsRaw = get('--min-events');
  const maxEventsRaw = get('--max-events');
  const maxEvents = maxEventsRaw ? Number.parseInt(maxEventsRaw, 10) : 6;
  const minEvents = minEventsRaw ? Number.parseInt(minEventsRaw, 10) : Math.max(1, Math.min(4, maxEvents));
  const maxTokensRaw = get('--max-tokens');
  const maxTokens = maxTokensRaw ? Number.parseInt(maxTokensRaw, 10) : 1100;
  const timeoutRaw = get('--timeout-ms');
  const timeoutMs = timeoutRaw ? Number.parseInt(timeoutRaw, 10) : 120_000;
  const delayRaw = get('--delay-ms');
  const delayMs = delayRaw ? Number.parseInt(delayRaw, 10) : 500;

  const stateFile =
    get('--state-file') || path.join(process.cwd(), 'data', 'research-candidates', 'timeline-batch-state.jsonl');

  const dryRun = argv.includes('--dry-run');
  const publish = !argv.includes('--draft');
  const resume = !argv.includes('--no-resume');
  const skipExisting = !argv.includes('--force') && !argv.includes('--no-skip-existing');
  const stopOnError = argv.includes('--stop-on-error');

  if (!Number.isFinite(top) || top < 1 || top > 5000) {
    throw new Error('Invalid --top. Use a number between 1 and 5000.');
  }
  if (!Number.isFinite(offset) || offset < 0) {
    throw new Error('Invalid --offset. Use a non-negative integer.');
  }
  if (!provider) {
    throw new Error('Invalid --provider. Use auto, openrouter, or gemini.');
  }
  if (!ageCoverage) {
    throw new Error('Invalid --age-coverage. Use strict, balanced, or off.');
  }
  if (!birthPolicy) {
    throw new Error('Invalid --birth-policy. Use forbid, discourage, or allow.');
  }
  if (!Number.isFinite(maxEvents) || maxEvents < 1 || maxEvents > 20) {
    throw new Error('Invalid --max-events. Use a number between 1 and 20.');
  }
  if (!Number.isFinite(minEvents) || minEvents < 1 || minEvents > maxEvents) {
    throw new Error('Invalid --min-events. Use a number between 1 and --max-events.');
  }
  if (!Number.isFinite(maxTokens) || maxTokens < 256 || maxTokens > 20000) {
    throw new Error('Invalid --max-tokens. Use a number between 256 and 20000.');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 5_000 || timeoutMs > 300_000) {
    throw new Error('Invalid --timeout-ms. Use a number between 5000 and 300000.');
  }
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 120_000) {
    throw new Error('Invalid --delay-ms. Use a number between 0 and 120000.');
  }

  return {
    dbPath,
    top,
    offset,
    provider,
    model,
    ageCoverage,
    birthPolicy,
    promptVersion,
    minEvents,
    maxEvents,
    maxTokens,
    timeoutMs,
    delayMs,
    publish,
    dryRun,
    resume,
    skipExisting,
    stopOnError,
    stateFile,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeGeminiModel(model: string): string {
  return model.startsWith('google/') ? model.slice('google/'.length) : model;
}

function resolveProvider(provider: CliArgs['provider'], model: string): 'openrouter' | 'gemini' {
  if (provider !== 'auto') return provider;
  const lower = model.toLowerCase();
  if (lower.startsWith('gemini-') || lower.startsWith('google/gemini-')) {
    return 'gemini';
  }
  return 'openrouter';
}

function modelForAssessment(provider: 'openrouter' | 'gemini', model: string): string {
  if (provider === 'gemini') return `gemini:${normalizeGeminiModel(model)}`;
  return model;
}

async function loadStateMap(stateFile: string): Promise<Map<string, StateEntry>> {
  const map = new Map<string, StateEntry>();
  let raw = '';
  try {
    raw = await readFile(stateFile, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ENOENT')) return map;
    throw error;
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as StateEntry;
      if (entry.figureId) map.set(entry.figureId, entry);
    } catch {
      // Ignore malformed lines so long-running batches can continue.
    }
  }

  return map;
}

async function appendState(stateFile: string, entry: StateEntry): Promise<void> {
  await mkdir(path.dirname(stateFile), { recursive: true });
  await appendFile(stateFile, `${JSON.stringify(entry)}\n`, 'utf8');
}

function runTimelineGeneration(args: CliArgs, figureId: string): Promise<CommandResult> {
  const commandArgs = [
    '--import',
    'tsx',
    'scripts/generate-figure-timeline-assessment.ts',
    `--figure-id=${figureId}`,
    `--db=${args.dbPath}`,
    `--provider=${args.provider}`,
    `--model=${args.model}`,
    `--age-coverage=${args.ageCoverage}`,
    `--birth-policy=${args.birthPolicy}`,
    `--prompt-version=${args.promptVersion}`,
    `--min-events=${args.minEvents}`,
    `--max-events=${args.maxEvents}`,
    `--max-tokens=${args.maxTokens}`,
    `--timeout-ms=${args.timeoutMs}`,
  ];
  if (args.publish) commandArgs.push('--publish');

  return new Promise((resolve, reject) => {
    const start = Date.now();
    const child = spawn('node', commandArgs, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (code) => {
      resolve({
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        elapsedMs: Date.now() - start,
      });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = resolveProvider(args.provider, args.model);
  const assessmentModel = modelForAssessment(provider, args.model);

  const db = new Database(args.dbPath, { readonly: true });
  const targets = db
    .prepare(
      `
      SELECT id, canonical_name as canonicalName, llm_consensus_rank as llmConsensusRank
      FROM figures
      WHERE llm_consensus_rank IS NOT NULL
      ORDER BY llm_consensus_rank ASC
      LIMIT ? OFFSET ?
      `
    )
    .all(args.top, args.offset) as FigureTarget[];

  const hasActiveAssessmentStmt = db.prepare(
    `
    SELECT 1
    FROM figure_assessments
    WHERE figure_id = ?
      AND assessment_kind = 'timeline_events'
      AND status IN ('draft', 'published')
      AND model = ?
      AND prompt_version = ?
    LIMIT 1
    `
  );

  if (targets.length === 0) {
    db.close();
    console.log('No figure targets found for batch run.');
    return;
  }

  const stateMap = await loadStateMap(args.stateFile);
  let skippedState = 0;
  let skippedExisting = 0;
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;

  console.log(
    `Batch start: targets=${targets.length} provider=${provider} model=${args.model} events=${args.minEvents}-${args.maxEvents} publish=${args.publish} resume=${args.resume} skipExisting=${args.skipExisting}`
  );
  console.log(`State file: ${args.stateFile}`);

  if (args.dryRun) {
    const sample = targets.slice(0, 10).map((row) => ({ id: row.id, name: row.canonicalName, rank: row.llmConsensusRank }));
    console.log(JSON.stringify({ mode: 'dry-run', totalTargets: targets.length, sample }, null, 2));
    db.close();
    return;
  }

  for (let i = 0; i < targets.length; i += 1) {
    const figure = targets[i];
    const position = `${i + 1}/${targets.length}`;

    if (args.resume) {
      const prior = stateMap.get(figure.id);
      if (prior && (prior.status === 'success' || prior.status === 'skipped_existing')) {
        skippedState += 1;
        console.log(`[${position}] skip(state): ${figure.id} (${figure.canonicalName})`);
        continue;
      }
    }

    if (args.skipExisting) {
      const exists = hasActiveAssessmentStmt.get(
        figure.id,
        assessmentModel,
        args.promptVersion
      ) as { 1: number } | undefined;
      if (exists) {
        skippedExisting += 1;
        const entry: StateEntry = {
          ts: new Date().toISOString(),
          figureId: figure.id,
          status: 'skipped_existing',
          message: `Existing active timeline assessment for model=${assessmentModel} prompt=${args.promptVersion}`,
        };
        stateMap.set(figure.id, entry);
        await appendState(args.stateFile, entry);
        console.log(`[${position}] skip(existing): ${figure.id} (${figure.canonicalName})`);
        continue;
      }
    }

    attempted += 1;
    console.log(`[${position}] run: ${figure.id} (${figure.canonicalName})`);

    try {
      const result = await runTimelineGeneration(args, figure.id);
      if (result.code === 0) {
        succeeded += 1;
        const entry: StateEntry = {
          ts: new Date().toISOString(),
          figureId: figure.id,
          status: 'success',
          message: result.stdout || 'ok',
          attemptMs: result.elapsedMs,
        };
        stateMap.set(figure.id, entry);
        await appendState(args.stateFile, entry);
        console.log(
          `[${position}] ok: ${figure.id} in ${(result.elapsedMs / 1000).toFixed(1)}s`
        );
      } else {
        failed += 1;
        const message = result.stderr || result.stdout || `Exit code ${result.code}`;
        const entry: StateEntry = {
          ts: new Date().toISOString(),
          figureId: figure.id,
          status: 'error',
          message,
          attemptMs: result.elapsedMs,
        };
        stateMap.set(figure.id, entry);
        await appendState(args.stateFile, entry);
        console.error(`[${position}] fail: ${figure.id} -> ${message}`);
        if (args.stopOnError) break;
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      const entry: StateEntry = {
        ts: new Date().toISOString(),
        figureId: figure.id,
        status: 'error',
        message,
      };
      stateMap.set(figure.id, entry);
      await appendState(args.stateFile, entry);
      console.error(`[${position}] fail: ${figure.id} -> ${message}`);
      if (args.stopOnError) break;
    }

    if (args.delayMs > 0) {
      await sleep(args.delayMs);
    }
  }

  db.close();

  console.log(
    `Batch done: attempted=${attempted} succeeded=${succeeded} failed=${failed} skippedState=${skippedState} skippedExisting=${skippedExisting}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
