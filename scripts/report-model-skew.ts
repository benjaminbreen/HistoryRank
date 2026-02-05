import { db, figures, rankings } from '../src/lib/db';
import { asc, eq, isNotNull, sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'data', 'quality-reports');

function normalizeCounts(counts: Record<string, number>): Record<string, number> {
  const total = Object.values(counts).reduce((sum, v) => sum + v, 0);
  if (total === 0) return counts;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) out[k] = v / total;
  return out;
}

function jensenShannon(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const epsilon = 1e-9;
  const m: Record<string, number> = {};
  for (const k of keys) {
    const av = a[k] ?? 0;
    const bv = b[k] ?? 0;
    m[k] = 0.5 * (av + bv);
  }
  const kl = (p: Record<string, number>, q: Record<string, number>) => {
    let sum = 0;
    for (const k of keys) {
      const pk = (p[k] ?? 0) + epsilon;
      const qk = (q[k] ?? 0) + epsilon;
      sum += pk * Math.log2(pk / qk);
    }
    return sum;
  };
  const js = 0.5 * kl(a, m) + 0.5 * kl(b, m);
  return Math.min(1, Math.max(0, js));
}

async function getConsensusTop1000() {
  const rows = await db
    .select({
      id: figures.id,
      regionMacro: figures.regionMacro,
      era: figures.era,
      domain: figures.domain,
    })
    .from(figures)
    .where(isNotNull(figures.llmConsensusRank))
    .orderBy(asc(figures.llmConsensusRank))
    .limit(1000);
  return rows;
}

async function getModelTop1000(source: string) {
  const rows = await db
    .select({
      figureId: rankings.figureId,
      avgRank: sql<number>`avg(${rankings.rank})`,
    })
    .from(rankings)
    .where(eq(rankings.source, source))
    .groupBy(rankings.figureId)
    .orderBy(asc(sql`avg(${rankings.rank})`))
    .limit(1000);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.figureId);
  const figuresRows = await db
    .select({
      id: figures.id,
      regionMacro: figures.regionMacro,
      era: figures.era,
      domain: figures.domain,
    })
    .from(figures)
    .where(sql`${figures.id} in (${sql.join(ids.map((id) => sql`${id}`), sql`,`)})`);

  const byId = new Map(figuresRows.map((r) => [r.id, r]));
  return rows.map((r) => byId.get(r.figureId)).filter(Boolean) as Array<{
    id: string;
    regionMacro: string | null;
    era: string | null;
    domain: string | null;
  }>;
}

function tally(rows: Array<{ regionMacro: string | null; era: string | null; domain: string | null }>) {
  const region: Record<string, number> = {};
  const era: Record<string, number> = {};
  const domain: Record<string, number> = {};

  for (const row of rows) {
    const r = row.regionMacro ?? 'Unknown';
    const e = row.era ?? 'Unknown';
    const d = row.domain ?? 'Unknown';
    region[r] = (region[r] || 0) + 1;
    era[e] = (era[e] || 0) + 1;
    domain[d] = (domain[d] || 0) + 1;
  }

  return {
    region: normalizeCounts(region),
    era: normalizeCounts(era),
    domain: normalizeCounts(domain),
  };
}

async function main() {
  const outputPathJson = path.join(OUTPUT_DIR, 'model-skew-report.json');
  const outputPathCsv = path.join(OUTPUT_DIR, 'model-skew-report.csv');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const consensusRows = await getConsensusTop1000();
  const consensusDist = tally(consensusRows);

  const sources = await db
    .select({ source: rankings.source })
    .from(rankings)
    .groupBy(rankings.source);

  const report: Array<{
    model: string;
    regionJs: number;
    eraJs: number;
    domainJs: number;
    avgJs: number;
    counts: { region: Record<string, number>; era: Record<string, number>; domain: Record<string, number> };
  }> = [];

  for (const row of sources) {
    const model = row.source;
    if (model === 'pantheon') continue;
    const topRows = await getModelTop1000(model);
    if (topRows.length === 0) continue;
    const dist = tally(topRows);
    const regionJs = jensenShannon(dist.region, consensusDist.region);
    const eraJs = jensenShannon(dist.era, consensusDist.era);
    const domainJs = jensenShannon(dist.domain, consensusDist.domain);
    const avgJs = (regionJs + eraJs + domainJs) / 3;
    report.push({ model, regionJs, eraJs, domainJs, avgJs, counts: dist });
  }

  report.sort((a, b) => b.avgJs - a.avgJs);

  fs.writeFileSync(outputPathJson, JSON.stringify({ consensus: consensusDist, report }, null, 2));

  const csvLines = [
    'model,region_js,era_js,domain_js,avg_js',
    ...report.map((r) => `${r.model},${r.regionJs.toFixed(4)},${r.eraJs.toFixed(4)},${r.domainJs.toFixed(4)},${r.avgJs.toFixed(4)}`),
  ];
  fs.writeFileSync(outputPathCsv, csvLines.join('\n'));

  console.log(`Wrote ${outputPathJson}`);
  console.log(`Wrote ${outputPathCsv}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
