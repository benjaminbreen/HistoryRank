import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// Load env
function loadEnvFile(fileName: string) {
  const envPath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.local');

const VALID_DOMAINS = [
  'Arts',
  'Politics',
  'Science',
  'Religion',
  'Philosophy',
  'Economics',
  'Military',
  'Medicine',
  'Social Reform',
  'Exploration',
  'Other'
] as const;

type Domain = typeof VALID_DOMAINS[number];

interface Figure {
  id: string;
  canonical_name: string;
  wikipedia_extract: string | null;
  occupation: string | null;
  era: string | null;
}

async function classifyBatch(figures: Figure[]): Promise<Map<string, Domain>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY');

  const figureList = figures.map((f, i) => {
    const extract = f.wikipedia_extract
      ? f.wikipedia_extract.slice(0, 200) + '...'
      : 'No description available';
    return `${i + 1}. ${f.canonical_name}${f.occupation ? ` (${f.occupation})` : ''}${f.era ? ` [${f.era}]` : ''}: ${extract}`;
  }).join('\n');

  const prompt = `Classify each historical figure into exactly ONE domain. Valid domains are:
- Arts (musicians, artists, writers, filmmakers, architects, photographers)
- Politics (rulers, politicians, activists, revolutionaries, diplomats, lawyers, judges)
- Science (scientists, mathematicians, engineers, inventors, researchers, academics, psychologists)
- Religion (religious leaders, theologians, saints, monks, spiritual figures)
- Philosophy (philosophers, intellectuals, logicians)
- Economics (businesspeople, entrepreneurs, economists, merchants)
- Military (generals, admirals, soldiers, military leaders, warriors)
- Medicine (doctors, surgeons, medical researchers)
- Social Reform (abolitionists, civil rights leaders, humanitarians, reformers)
- Exploration (explorers, adventurers, navigators, astronauts)
- Other (athletes, celebrities, companions of famous people, or truly unclassifiable)

For each figure, respond with ONLY the number and domain, one per line. Example:
1. Arts
2. Politics
3. Science

Figures to classify:
${figureList}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'HistoryRank Domain Classification',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-haiku-4.5',
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';

  const results = new Map<string, Domain>();
  const lines = content.split('\n').filter((l: string) => l.trim());

  for (const line of lines) {
    // Parse "1. Arts" or "1: Arts" or "1 - Arts" formats
    const match = line.match(/^(\d+)[.\s:\-]+(.+)$/);
    if (match) {
      const idx = parseInt(match[1], 10) - 1;
      const domainRaw = match[2].trim();

      // Find matching domain (case-insensitive)
      const domain = VALID_DOMAINS.find(d =>
        d.toLowerCase() === domainRaw.toLowerCase()
      );

      if (domain && figures[idx]) {
        results.set(figures[idx].id, domain);
      }
    }
  }

  return results;
}

async function main() {
  const dbPath = path.join(process.cwd(), 'historyrank.db');
  const db = new Database(dbPath);

  // Get figures with NULL domain
  const figures = db.prepare(`
    SELECT id, canonical_name, wikipedia_extract, occupation, era
    FROM figures
    WHERE domain IS NULL
    ORDER BY llm_consensus_rank ASC
  `).all() as Figure[];

  console.log(`Found ${figures.length} figures with NULL domain`);

  if (figures.length === 0) {
    console.log('Nothing to classify!');
    db.close();
    return;
  }

  const updateStmt = db.prepare('UPDATE figures SET domain = ? WHERE id = ?');
  const BATCH_SIZE = 30;
  let classified = 0;
  let errors = 0;

  for (let i = 0; i < figures.length; i += BATCH_SIZE) {
    const batch = figures.slice(i, i + BATCH_SIZE);
    console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(figures.length / BATCH_SIZE)} (${batch.length} figures)...`);

    try {
      const results = await classifyBatch(batch);

      for (const [id, domain] of results) {
        updateStmt.run(domain, id);
        classified++;
      }

      const missed = batch.length - results.size;
      if (missed > 0) {
        console.log(`  Warning: ${missed} figures not classified in this batch`);
        errors += missed;
      }

      console.log(`  Classified ${results.size} figures`);

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 500));

    } catch (error) {
      console.error(`  Error processing batch:`, error);
      errors += batch.length;
    }
  }

  db.close();

  console.log(`\n=== Done ===`);
  console.log(`Classified: ${classified}`);
  console.log(`Errors/missed: ${errors}`);

  // Show updated counts
  const db2 = new Database(dbPath);
  const counts = db2.prepare(`
    SELECT domain, COUNT(*) as count
    FROM figures
    GROUP BY domain
    ORDER BY count DESC
  `).all();
  db2.close();

  console.log('\nUpdated domain counts:');
  for (const row of counts as Array<{domain: string | null, count: number}>) {
    console.log(`  ${row.domain || '(NULL)'}: ${row.count}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
