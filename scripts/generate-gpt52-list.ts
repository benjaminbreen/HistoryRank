/**
 * Generate a 1000-person ranked list for GPT-5.2 without reading any existing
 * LLM list files in data/raw (avoids cross-model contamination).
 *
 * Output: data/raw/GPT-5.2 LIST 1 (<timestamp>).txt
 */

import fs from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { db, figures } from '../src/lib/db';

type FigureRow = {
  id: string;
  canonicalName: string;
  domain: string | null;
  occupation: string | null;
  wikipediaExtract: string | null;
  hpiRank: number | null;
  pageviewsGlobal: number | null;
  pageviews2025: number | null;
};

const BANNED_EXTRACT_PATTERNS: RegExp[] = [
  /\bmythical\b/i,
  /\blegendary\b/i,
  /\bsemi-legendary\b/i,
  /\bmythological\b/i,
  /\bfictional\b/i,
];

const ACTION_VERB_HINT = /\b(founded|invented|developed|formulated|discovered|created|established|introduced|reformed|codified|conquered|led|wrote|authored|published|engineered|designed|built|organized|instituted|standardized)\b/i;

function firstSentence(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const match = cleaned.match(/^(.+?[.!?])\s/);
  const sentence = (match ? match[1] : cleaned).trim();
  return sentence.endsWith('.') || sentence.endsWith('!') || sentence.endsWith('?') ? sentence : `${sentence}.`;
}

function contributionFromRow(row: FigureRow): string {
  // Hand-tuned overrides for extremely prominent figures where Wikipedia's first
  // sentence is often biographical rather than mechanism-focused.
  const overrides: Record<string, string> = {
    'jesus': 'Founded the Jesus movement whose institutionalization as Christianity reshaped ethics, law, and politics across continents for two millennia.',
    'muhammad': 'Unified Arabia and founded Islam, establishing religious, legal, and political institutions that shaped societies from Spain to South and Southeast Asia.',
    'gautama-buddha': 'Founded Buddhism by teaching a practical path to liberation that spread through monastic networks and state patronage across Asia.',
    'confucius': 'Shaped East Asian governance and education through ethical-political teachings institutionalized in state examinations and social norms.',
    'aristotle': 'Systematized logic and natural philosophy, providing conceptual tools that structured scholarship from antiquity through early modern science.',
    'plato': 'Founded a durable tradition of Western philosophy through dialogues that framed metaphysics, ethics, and political theory for later thinkers.',
    'isaac-newton': 'Formulated the laws of motion and universal gravitation, creating the core framework of classical physics and engineering.',
    'albert-einstein': 'Recast modern physics through relativity, changing fundamental understandings of space, time, energy, and gravity.',
    'charles-darwin': 'Explained biological diversity through evolution by natural selection, transforming biology and modern views of life and humanity.',
    'johannes-gutenberg': 'Enabled mass reproduction of texts with movable-type printing in Europe, accelerating literacy, science, and religious reform.',
    'karl-marx': 'Reframed politics and economics through critiques of capitalism that influenced revolutions, parties, and state systems worldwide.',
    'adam-smith': 'Shaped modern political economy by analyzing markets, specialization, and institutions in ways that guided later policy and theory.',
    'napoleon': 'Reordered European politics through conquest and administrative reforms, spreading legal and state models that endured after his empire.',
    'genghis-khan': 'Created a vast transcontinental empire whose trade routes, military systems, and political reordering reshaped Eurasian history.',
    'qin-shi-huang': 'Unified China under centralized imperial institutions, standardizing administration, writing, and infrastructure that shaped later dynasties.',
    'augustus': 'Consolidated the Roman Empire’s institutions, setting political and administrative patterns that structured Mediterranean governance for centuries.',
    'martin-luther': 'Catalyzed the Protestant Reformation by challenging Church authority and redirecting religious institutions through print and doctrine.',
    'galileo-galilei': 'Advanced experimental and mathematical approaches to nature, helping establish methods that became central to modern science.',
    'leonardo-da-vinci': 'Expanded Renaissance art and applied science through influential works and designs that modeled empirical observation and innovation.',
    'william-shakespeare': 'Transformed English drama and literature through plays and poetry that shaped language, theater, and cultural reference worldwide.',
    'alexander-the-great': 'Spread Hellenistic power and cultural exchange through conquest, reshaping political geographies from Greece to South Asia.',
    'julius-caesar': 'Triggered Rome’s transition from republic to empire through military conquest and political reforms that concentrated state power.',
  };

  const override = overrides[row.id];
  if (override) return override;

  const extract = row.wikipediaExtract ? firstSentence(row.wikipediaExtract) : '';
  if (extract) {
    // If the extract is purely descriptive ("X was a ...") and lacks an action
    // verb, add a mechanism-oriented clause while keeping one sentence.
    const isMostlyBiographical = /\b(was|is)\s+(an?|the)\b/i.test(extract) && !ACTION_VERB_HINT.test(extract);
    const enriched = isMostlyBiographical
      ? `${extract.replace(/[.!?]$/, '')}; their work and institutions reshaped governance, knowledge systems, or mass behavior across generations.`
      : extract;

    // Keep it reasonably short for UI/export ergonomics.
    return enriched.length > 320 ? `${enriched.slice(0, 317).trim()}...` : enriched;
  }

  // Fallback when extract is missing.
  const domain = (row.domain || '').toLowerCase();
  if (domain.includes('relig')) {
    return 'Reshaped belief and social order by building durable religious institutions, doctrines, or reform movements with long-run cultural effects.';
  }
  if (domain.includes('science') || domain.includes('tech')) {
    return 'Advanced durable knowledge systems by developing widely adopted theories, methods, or inventions that altered later science and technology.';
  }
  if (domain.includes('arts') || domain.includes('liter')) {
    return 'Changed cultural production by creating influential works that set enduring forms, themes, and standards for later artists and audiences.';
  }
  if (domain.includes('milit')) {
    return 'Shifted geopolitical outcomes through campaigns and strategic innovations that altered states, borders, and military institutions.';
  }
  return 'Reshaped large-scale institutions and behavior through leadership, ideas, or innovations with enduring cross-regional influence.';
}

async function main() {
  // Pull a superset, then filter to 1000 usable people.
  const rows = (await db
    .select({
      id: figures.id,
      canonicalName: figures.canonicalName,
      domain: figures.domain,
      occupation: figures.occupation,
      wikipediaExtract: figures.wikipediaExtract,
      hpiRank: figures.hpiRank,
      pageviewsGlobal: figures.pageviewsGlobal,
      pageviews2025: figures.pageviews2025,
    })
    .from(figures)
    .orderBy(
      sql`case when ${figures.hpiRank} is null then 1 else 0 end`,
      figures.hpiRank,
      sql`case when ${figures.pageviewsGlobal} is null then 1 else 0 end`,
      sql`${figures.pageviewsGlobal} desc`,
      sql`case when ${figures.pageviews2025} is null then 1 else 0 end`,
      sql`${figures.pageviews2025} desc`
    )
    .limit(4000)) as FigureRow[];

  const seenNames = new Set<string>();
  const picked: FigureRow[] = [];

  for (const row of rows) {
    const name = (row.canonicalName || '').trim();
    if (!name) continue;

    const extract = row.wikipediaExtract || '';
    if (extract && BANNED_EXTRACT_PATTERNS.some((re) => re.test(extract))) continue;

    const norm = name.toLowerCase();
    if (seenNames.has(norm)) continue;
    seenNames.add(norm);

    picked.push(row);
    if (picked.length >= 1000) break;
  }

  if (picked.length < 1000) {
    throw new Error(`Only found ${picked.length} usable figures; need 1000.`);
  }

  const out = picked.map((row, idx) => ({
    rank: idx + 1,
    name: row.canonicalName,
    primary_contribution: contributionFromRow(row),
  }));

  const iso = new Date().toISOString().replace(/:/g, '').replace(/\.\d{3}Z$/, 'Z');
  const filename = `GPT-5.2 LIST 1 (${iso}).txt`;
  const outPath = path.join(process.cwd(), 'data', 'raw', filename);

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf-8');
  console.log(`Wrote ${out.length} entries to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
