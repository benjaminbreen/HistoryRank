import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

type RawEntry = {
  rank?: number;
  name: string;
  primary_contribution?: string;
};

type ListData = {
  file: string;
  model: string;
  ranks: Map<string, number>;
};

type Consensus = {
  avgRank: Map<string, number>;
  topIds: string[];
};

type AnomalyCounts = Record<string, number>;
type Benchmark = {
  key: string;
  description: string;
  check: (rank: (name: string) => number | null) => boolean | null;
};

const RAW_V1_DIR = path.join(process.cwd(), 'data', 'raw');
const RAW_V2_DIR = path.join(process.cwd(), 'data', 'raw_v2');
const RAW_V3_DIR = path.join(process.cwd(), 'data', 'raw_v3');
const OVERRIDES_FILE = path.join(process.cwd(), 'data', 'figure-overrides.json');

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractJsonArray(text: string): string {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON array found in file');
  }
  return text.slice(start, end + 1);
}

function inferModelFromFilename(file: string, label: 'v1' | 'v2' | 'v3'): string {
  if (label === 'v2') {
    const base = file.replace(/\.txt$/, '');
    const parts = base.split(' V2 LIST ');
    return parts[0].trim();
  }
  if (label === 'v3') {
    const base = file.replace(/\.txt$/, '');
    const parts = base.split(' V3 LIST ');
    return parts[0].trim();
  }
  const base = file.replace(/\.txt$/, '');
  const parts = base.split(' LIST ');
  return parts[0].trim();
}

function loadAliasMap(db: Database.Database) {
  const rows = db.prepare('SELECT alias, figure_id FROM name_aliases').all();
  const aliasMap = new Map<string, string>();
  for (const row of rows as Array<{ alias: string; figure_id: string }>) {
    aliasMap.set(row.alias, row.figure_id);
  }
  return aliasMap;
}

function loadMergeRemap() {
  const remap = new Map<string, string>();
  if (!fs.existsSync(OVERRIDES_FILE)) return remap;
  const overrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8')) as {
    merges?: Record<string, string[]>;
  };
  const merges = overrides.merges || {};
  for (const [keepId, deleteIds] of Object.entries(merges)) {
    for (const deleteId of deleteIds) remap.set(deleteId, keepId);
  }
  return remap;
}

function loadLists(dir: string, label: 'v1' | 'v2' | 'v3', aliasMap: Map<string, string>, mergeRemap: Map<string, string>): ListData[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.txt') && !f.endsWith('.quality.txt') && !f.endsWith('.quality.json'))
    .sort();

  const lists: ListData[] = [];
  for (const file of files) {
    const full = path.join(dir, file);
    const content = fs.readFileSync(full, 'utf8');
    let entries: RawEntry[] = [];
    try {
      entries = JSON.parse(extractJsonArray(content)) as RawEntry[];
    } catch {
      continue;
    }

    const ranks = new Map<string, number>();
    entries.forEach((entry, idx) => {
      if (!entry?.name) return;
      const nameNorm = normalizeName(entry.name);
      const figureId = aliasMap.get(nameNorm);
      if (!figureId) return;
      const mergedId = mergeRemap.get(figureId) || figureId;
      const rank = typeof entry.rank === 'number' ? entry.rank : idx + 1;
      if (ranks.has(mergedId)) {
        const existing = ranks.get(mergedId) as number;
        if (rank < existing) ranks.set(mergedId, rank);
        return;
      }
      ranks.set(mergedId, rank);
    });

    lists.push({
      file,
      model: inferModelFromFilename(file, label),
      ranks,
    });
  }

  return lists;
}

function buildConsensus(lists: ListData[]): Consensus {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const list of lists) {
    for (const [id, rank] of list.ranks.entries()) {
      const record = totals.get(id) || { sum: 0, count: 0 };
      record.sum += rank;
      record.count += 1;
      totals.set(id, record);
    }
  }

  const avgRank = new Map<string, number>();
  for (const [id, { sum, count }] of totals.entries()) {
    avgRank.set(id, sum / count);
  }

  const topIds = Array.from(avgRank.entries())
    .sort((a, b) => a[1] - b[1])
    .slice(0, 200)
    .map(([id]) => id);

  return { avgRank, topIds };
}

function spearman(ids: string[], a: Map<string, number>, b: Map<string, number>): number | null {
  const n = ids.length;
  if (n < 10) return null;

  const rankMap = (m: Map<string, number>) => {
    const ordered = ids
      .filter((id) => m.has(id))
      .sort((x, y) => (m.get(x) as number) - (m.get(y) as number));
    const out = new Map<string, number>();
    ordered.forEach((id, idx) => out.set(id, idx + 1));
    return out;
  };

  const ra = rankMap(a);
  const rb = rankMap(b);

  let sum = 0;
  for (const id of ids) {
    const r1 = ra.get(id);
    const r2 = rb.get(id);
    if (r1 == null || r2 == null) return null;
    const d = r1 - r2;
    sum += d * d;
  }
  return 1 - (6 * sum) / (n * (n * n - 1));
}

function sample<T>(arr: T[], size: number, rng: () => number): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, size);
}

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function overlap(a: string[], b: string[]): number {
  const setB = new Set(b);
  let hit = 0;
  for (const id of a) if (setB.has(id)) hit++;
  return hit / Math.max(1, a.length);
}

function resolveIds(db: Database.Database, aliasMap: Map<string, string>, mergeRemap: Map<string, string>, names: string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const name of names) {
    const norm = normalizeName(name);
    const aliasId = aliasMap.get(norm);
    if (aliasId) {
      out[name] = mergeRemap.get(aliasId) || aliasId;
      continue;
    }
    const row = db.prepare('SELECT id FROM figures WHERE lower(canonical_name) = ?').get(name.toLowerCase()) as { id: string } | undefined;
    out[name] = row ? (mergeRemap.get(row.id) || row.id) : null;
  }
  return out;
}

function computeAnomalies(lists: ListData[], ids: Record<string, string | null>): AnomalyCounts {
  const counts: AnomalyCounts = {
    paul_allen_above_gates: 0,
    paul_allen_above_beethoven: 0,
    paul_allen_above_dante: 0,
    beatles_and_members: 0,
    mao_below_top50: 0,
    hitler_below_top50: 0,
  };

  const id = (name: string) => ids[name];

  for (const list of lists) {
    const rank = (name: string) => {
      const rid = id(name);
      return rid ? list.ranks.get(rid) ?? null : null;
    };

    const paul = rank('Paul Allen');
    const gates = rank('Bill Gates');
    const beethoven = rank('Ludwig van Beethoven');
    const dante = rank('Dante Alighieri');
    if (paul != null && gates != null && paul < gates) counts.paul_allen_above_gates++;
    if (paul != null && beethoven != null && paul < beethoven) counts.paul_allen_above_beethoven++;
    if (paul != null && dante != null && paul < dante) counts.paul_allen_above_dante++;

    const beatles = rank('The Beatles');
    const lennon = rank('John Lennon');
    const mccartney = rank('Paul McCartney');
    if (beatles != null && (lennon != null || mccartney != null)) counts.beatles_and_members++;

    const mao = rank('Mao Zedong');
    if (mao != null && mao > 50) counts.mao_below_top50++;

    const hitler = rank('Adolf Hitler');
    if (hitler != null && hitler > 50) counts.hitler_below_top50++;
  }

  return counts;
}

function buildBenchmarks(): Benchmark[] {
  return [
    {
      key: 'hitler_over_himmler',
      description: 'Hitler should outrank Himmler',
      check: (rank) => {
        const a = rank('Adolf Hitler');
        const b = rank('Heinrich Himmler');
        if (a == null || b == null) return null;
        return a < b;
      },
    },
    {
      key: 'stalin_over_beria',
      description: 'Stalin should outrank Beria',
      check: (rank) => {
        const a = rank('Joseph Stalin');
        const b = rank('Lavrentiy Beria');
        if (a == null || b == null) return null;
        return a < b;
      },
    },
    {
      key: 'napoleon_over_ney',
      description: 'Napoleon should outrank Marshal Ney',
      check: (rank) => {
        const a = rank('Napoleon');
        const b = rank('Michel Ney');
        if (a == null || b == null) return null;
        return a < b;
      },
    },
    {
      key: 'caesar_over_brutus',
      description: 'Julius Caesar should outrank Brutus',
      check: (rank) => {
        const a = rank('Julius Caesar');
        const b = rank('Marcus Junius Brutus');
        if (a == null || b == null) return null;
        return a < b;
      },
    },
    {
      key: 'charlemagne_over_roland',
      description: 'Charlemagne should outrank Roland',
      check: (rank) => {
        const a = rank('Charlemagne');
        const b = rank('Roland');
        if (a == null || b == null) return null;
        return a < b;
      },
    },
    {
      key: 'newton_over_hooke',
      description: 'Isaac Newton should outrank Robert Hooke',
      check: (rank) => {
        const a = rank('Isaac Newton');
        const b = rank('Robert Hooke');
        if (a == null || b == null) return null;
        return a < b;
      },
    },
    {
      key: 'einstein_over_bohr',
      description: 'Einstein should outrank Niels Bohr',
      check: (rank) => {
        const a = rank('Albert Einstein');
        const b = rank('Niels Bohr');
        if (a == null || b == null) return null;
        return a < b;
      },
    },
    {
      key: 'darwin_over_wallace',
      description: 'Darwin should outrank Alfred Russel Wallace',
      check: (rank) => {
        const a = rank('Charles Darwin');
        const b = rank('Alfred Russel Wallace');
        if (a == null || b == null) return null;
        return a < b;
      },
    },
    {
      key: 'marx_over_engels',
      description: 'Marx should outrank Engels',
      check: (rank) => {
        const a = rank('Karl Marx');
        const b = rank('Friedrich Engels');
        if (a == null || b == null) return null;
        return a < b;
      },
    },
    {
      key: 'freud_over_jung',
      description: 'Freud should outrank Jung',
      check: (rank) => {
        const a = rank('Sigmund Freud');
        const b = rank('Carl Jung');
        if (a == null || b == null) return null;
        return a < b;
      },
    },
    {
      key: 'luther_over_melanchthon',
      description: 'Martin Luther should outrank Philipp Melanchthon',
      check: (rank) => {
        const a = rank('Martin Luther');
        const b = rank('Philipp Melanchthon');
        if (a == null || b == null) return null;
        return a < b;
      },
    },
    {
      key: 'washington_over_jefferson',
      description: 'Washington should outrank Jefferson',
      check: (rank) => {
        const a = rank('George Washington');
        const b = rank('Thomas Jefferson');
        if (a == null || b == null) return null;
        return a < b;
      },
    },
    {
      key: 'lincoln_over_davis',
      description: 'Lincoln should outrank Jefferson Davis',
      check: (rank) => {
        const a = rank('Abraham Lincoln');
        const b = rank('Jefferson Davis');
        if (a == null || b == null) return null;
        return a < b;
      },
    },
    {
      key: 'gandhi_over_nehru',
      description: 'Gandhi should outrank Nehru',
      check: (rank) => {
        const a = rank('Mahatma Gandhi');
        const b = rank('Jawaharlal Nehru');
        if (a == null || b == null) return null;
        return a < b;
      },
    },
    {
      key: 'mandela_over_tambo',
      description: 'Mandela should outrank Oliver Tambo',
      check: (rank) => {
        const a = rank('Nelson Mandela');
        const b = rank('Oliver Tambo');
        if (a == null || b == null) return null;
        return a < b;
      },
    },
    {
      key: 'churchill_over_attlee',
      description: 'Churchill should outrank Attlee',
      check: (rank) => {
        const a = rank('Winston Churchill');
        const b = rank('Clement Attlee');
        if (a == null || b == null) return null;
        return a < b;
      },
    },
    {
      key: 'edison_over_tesla',
      description: 'Edison should outrank Tesla (debatable, but common in macro‑impact)',
      check: (rank) => {
        const a = rank('Thomas Edison');
        const b = rank('Nikola Tesla');
        if (a == null || b == null) return null;
        return a < b;
      },
    },
    {
      key: 'paul_allen_above_gates',
      description: 'Paul Allen should not outrank Bill Gates',
      check: (rank) => {
        const a = rank('Paul Allen');
        const b = rank('Bill Gates');
        if (a == null || b == null) return null;
        return a > b;
      },
    },
  ];
}

function benchmarkScores(lists: ListData[], ids: Record<string, string | null>) {
  const benchmarks = buildBenchmarks();
  const results: Record<string, { pass: number; fail: number; n: number; description: string }> = {};

  for (const b of benchmarks) {
    results[b.key] = { pass: 0, fail: 0, n: 0, description: b.description };
  }

  for (const list of lists) {
    const rank = (name: string) => {
      const rid = ids[name];
      return rid ? list.ranks.get(rid) ?? null : null;
    };
    for (const b of benchmarks) {
      const verdict = b.check(rank);
      if (verdict == null) continue;
      results[b.key].n += 1;
      if (verdict) results[b.key].pass += 1;
      else results[b.key].fail += 1;
    }
  }

  return results;
}

function summarizeSubsamples(label: string, lists: ListData[], sampleSizes: number[]) {
  const full = buildConsensus(lists);
  const rng = makeRng(42);
  const runs = 50;

  console.log(`\n${label} lists: ${lists.length}`);
  console.log(`Top-200 size: ${full.topIds.length}`);

  for (const size of sampleSizes) {
    if (size >= lists.length) continue;
    const correlations: number[] = [];
    const overlaps: number[] = [];
    for (let i = 0; i < runs; i++) {
      const sub = sample(lists, size, rng);
      const subConsensus = buildConsensus(sub);
      const overlapIds = subConsensus.topIds.filter((id) => full.avgRank.has(id) && subConsensus.avgRank.has(id));
      const corr = spearman(overlapIds, subConsensus.avgRank, full.avgRank);
      if (corr != null) correlations.push(corr);
      overlaps.push(overlap(subConsensus.topIds, full.topIds));
    }

    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
    const meanCorr = mean(correlations);
    const meanOverlap = mean(overlaps);
    console.log(`  sample=${size} | spearman(top200)≈${meanCorr.toFixed(3)} | overlap≈${meanOverlap.toFixed(3)}`);
  }
}

function summarizeEqualSample(labelA: string, listsA: ListData[], labelB: string, listsB: ListData[], sizeOverride?: number) {
  const size = sizeOverride ?? Math.min(listsA.length, listsB.length) - 1;
  const runs = 50;
  const rng = makeRng(123);
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);

  const fullA = buildConsensus(listsA);
  const fullB = buildConsensus(listsB);

  const corrA: number[] = [];
  const corrB: number[] = [];
  const overlapA: number[] = [];
  const overlapB: number[] = [];

  for (let i = 0; i < runs; i++) {
    const subA = sample(listsA, size, rng);
    const subB = sample(listsB, size, rng);
    const conA = buildConsensus(subA);
    const conB = buildConsensus(subB);

    const idsA = conA.topIds.filter((id) => fullA.avgRank.has(id) && conA.avgRank.has(id));
    const idsB = conB.topIds.filter((id) => fullB.avgRank.has(id) && conB.avgRank.has(id));

    const rA = spearman(idsA, conA.avgRank, fullA.avgRank);
    const rB = spearman(idsB, conB.avgRank, fullB.avgRank);
    if (rA != null) corrA.push(rA);
    if (rB != null) corrB.push(rB);

    overlapA.push(overlap(conA.topIds, fullA.topIds));
    overlapB.push(overlap(conB.topIds, fullB.topIds));
  }

  console.log(`\nEqual-sample comparison (n=${size} lists per group, ${runs} runs):`);
  console.log(`  ${labelA}: spearman≈${mean(corrA).toFixed(3)} | overlap≈${mean(overlapA).toFixed(3)}`);
  console.log(`  ${labelB}: spearman≈${mean(corrB).toFixed(3)} | overlap≈${mean(overlapB).toFixed(3)}`);
}

function summarizeFixedSample(label: string, lists: ListData[], size: number) {
  const runs = 50;
  const rng = makeRng(777);
  const full = buildConsensus(lists);
  const correlations: number[] = [];
  const overlaps: number[] = [];

  if (lists.length < size) {
    console.log(`\n${label}: not enough lists for sample=${size} (have ${lists.length})`);
    return;
  }

  for (let i = 0; i < runs; i++) {
    const sub = sample(lists, size, rng);
    const con = buildConsensus(sub);
    const ids = con.topIds.filter((id) => full.avgRank.has(id) && con.avgRank.has(id));
    const corr = spearman(ids, con.avgRank, full.avgRank);
    if (corr != null) correlations.push(corr);
    overlaps.push(overlap(con.topIds, full.topIds));
  }

  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  console.log(`\n${label} fixed-sample (n=${size}, ${runs} runs):`);
  console.log(`  spearman(top200)≈${mean(correlations).toFixed(3)} | overlap≈${mean(overlaps).toFixed(3)}`);
}

function main() {
  const db = new Database('historyrank.db');
  const aliasMap = loadAliasMap(db);
  const mergeRemap = loadMergeRemap();

  const v1Lists = loadLists(RAW_V1_DIR, 'v1', aliasMap, mergeRemap);
  const v2Lists = loadLists(RAW_V2_DIR, 'v2', aliasMap, mergeRemap);
  const v3Lists = loadLists(RAW_V3_DIR, 'v3', aliasMap, mergeRemap);
  const v23Lists = [...v2Lists, ...v3Lists];

  const benchmarkNames = [
    'Paul Allen',
    'Bill Gates',
    'Ludwig van Beethoven',
    'Dante Alighieri',
    'The Beatles',
    'John Lennon',
    'Paul McCartney',
    'Mao Zedong',
    'Adolf Hitler',
    'Heinrich Himmler',
    'Joseph Stalin',
    'Lavrentiy Beria',
    'Napoleon',
    'Michel Ney',
    'Julius Caesar',
    'Marcus Junius Brutus',
    'Charlemagne',
    'Roland',
    'Isaac Newton',
    'Robert Hooke',
    'Albert Einstein',
    'Niels Bohr',
    'Charles Darwin',
    'Alfred Russel Wallace',
    'Karl Marx',
    'Friedrich Engels',
    'Sigmund Freud',
    'Carl Jung',
    'Martin Luther',
    'Philipp Melanchthon',
    'George Washington',
    'Thomas Jefferson',
    'Abraham Lincoln',
    'Jefferson Davis',
    'Mahatma Gandhi',
    'Jawaharlal Nehru',
    'Nelson Mandela',
    'Oliver Tambo',
    'Winston Churchill',
    'Clement Attlee',
    'Thomas Edison',
    'Nikola Tesla',
  ];

  const ids = resolveIds(db, aliasMap, mergeRemap, benchmarkNames);

  console.log('Resolved IDs:');
  for (const [name, id] of Object.entries(ids)) {
    console.log(`  ${name}: ${id || 'NOT FOUND'}`);
  }

  console.log('\nAnomaly counts (per list):');
  const v1Anomalies = computeAnomalies(v1Lists, ids);
  const v2Anomalies = computeAnomalies(v2Lists, ids);
  const v3Anomalies = computeAnomalies(v3Lists, ids);
  const v23Anomalies = computeAnomalies(v23Lists, ids);
  const fmt = (counts: AnomalyCounts, total: number) =>
    Object.entries(counts)
      .map(([k, v]) => `${k}: ${v}/${total} (${((v / Math.max(1, total)) * 100).toFixed(1)}%)`)
      .join('\n');

  console.log('\nV1:');
  console.log(fmt(v1Anomalies, v1Lists.length));
  console.log('\nV2:');
  console.log(fmt(v2Anomalies, v2Lists.length));
  console.log('\nV3:');
  console.log(fmt(v3Anomalies, v3Lists.length));
  console.log('\nV2+V3:');
  console.log(fmt(v23Anomalies, v23Lists.length));

  console.log('\nBenchmark checks (pass rate):');
  const v1Bench = benchmarkScores(v1Lists, ids);
  const v2Bench = benchmarkScores(v2Lists, ids);
  const v3Bench = benchmarkScores(v3Lists, ids);
  const v23Bench = benchmarkScores(v23Lists, ids);
  const keys = Object.keys(v1Bench);
  for (const key of keys) {
    const b1 = v1Bench[key];
    const b2 = v2Bench[key];
    const b3 = v3Bench[key];
    const p1 = b1.n ? (b1.pass / b1.n) * 100 : 0;
    const p2 = b2.n ? (b2.pass / b2.n) * 100 : 0;
    const p3 = b3.n ? (b3.pass / b3.n) * 100 : 0;
    const b23 = v23Bench[key];
    const p23 = b23.n ? (b23.pass / b23.n) * 100 : 0;
    console.log(
      `  ${key} | V1 ${p1.toFixed(1)}% (n=${b1.n}) | V2 ${p2.toFixed(1)}% (n=${b2.n}) | V3 ${p3.toFixed(1)}% (n=${b3.n}) | V2+V3 ${p23.toFixed(1)}% (n=${b23.n}) | ${b1.description}`
    );
  }

  summarizeSubsamples('V1', v1Lists, [5, 10, 20, 40, 60]);
  summarizeSubsamples('V2', v2Lists, [3, 5, 8, 10, 12]);
  summarizeSubsamples('V3', v3Lists, [3, 5, 8, 10, 12]);
  summarizeSubsamples('V2+V3', v23Lists, [5, 9, 12, 16, 20]);

  summarizeEqualSample('V1', v1Lists, 'V2', v2Lists);
  summarizeEqualSample('V1', v1Lists, 'V3', v3Lists);
  summarizeEqualSample('V2', v2Lists, 'V3', v3Lists);
  summarizeEqualSample('V1', v1Lists, 'V2+V3', v23Lists);

  summarizeFixedSample('V1', v1Lists, 9);
  summarizeFixedSample('V2', v2Lists, 9);
  summarizeFixedSample('V3', v3Lists, 9);
  summarizeFixedSample('V2+V3', v23Lists, 9);
}

main();
