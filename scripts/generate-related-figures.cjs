/**
 * Generate related figures for top N figures using LLM
 * Uses OpenRouter API with a fast/cheap model
 *
 * Usage: node scripts/generate-related-figures.cjs [--limit=1000] [--model=anthropic/claude-3-haiku]
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Load env
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
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

const DB_PATH = path.join(process.cwd(), 'historyrank.db');
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error('Missing OPENROUTER_API_KEY in .env.local');
  process.exit(1);
}

// Parse args
const args = process.argv.slice(2);
let LIMIT = 1000;
let MODEL = 'anthropic/claude-3-haiku'; // Fast and cheap
let SKIP_EXISTING = true;
let BATCH_SIZE = 10; // Process in batches for progress visibility

for (const arg of args) {
  if (arg.startsWith('--limit=')) LIMIT = parseInt(arg.slice(8));
  if (arg.startsWith('--model=')) MODEL = arg.slice(8);
  if (arg === '--no-skip') SKIP_EXISTING = false;
  if (arg.startsWith('--batch=')) BATCH_SIZE = parseInt(arg.slice(8));
}

const db = new Database(DB_PATH);

// Get all figure names for matching
const allFigures = db.prepare(`
  SELECT id, canonical_name FROM figures
`).all();

const nameToId = new Map();
const idToName = new Map();
for (const fig of allFigures) {
  // Store multiple lookup keys for fuzzy matching
  nameToId.set(fig.canonical_name.toLowerCase(), fig.id);
  idToName.set(fig.id, fig.canonical_name);

  // Also store without common prefixes/suffixes
  const simplified = fig.canonical_name
    .toLowerCase()
    .replace(/^(saint|st\.|emperor|empress|king|queen|pope|prophet|the) /i, '')
    .replace(/ (the great|i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/i, '');
  if (simplified !== fig.canonical_name.toLowerCase()) {
    nameToId.set(simplified, fig.id);
  }
}

function findFigureId(name) {
  const lower = name.toLowerCase().trim();

  // Direct match
  if (nameToId.has(lower)) return nameToId.get(lower);

  // Try without titles
  const simplified = lower
    .replace(/^(saint|st\.|emperor|empress|king|queen|pope|prophet|the) /i, '')
    .replace(/ (the great|i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/i, '');
  if (nameToId.has(simplified)) return nameToId.get(simplified);

  // Try partial match (first + last name)
  for (const [key, id] of nameToId.entries()) {
    if (key.includes(lower) || lower.includes(key)) {
      return id;
    }
  }

  return null;
}

async function callOpenRouter(prompt) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://historyrank.org',
      'X-Title': 'HistoryRank Related Figures',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

function parseRelatedFigures(text, sourceFigureId) {
  const related = [];
  const lines = text.split('\n').filter(l => l.trim());

  for (const line of lines) {
    // Try to parse lines like "1. Plato - teacher and mentor" or "- Plato (teacher)"
    const match = line.match(/^[\d\-\.\*]+\s*(.+?)(?:\s*[-–:]\s*(.+))?$/);
    if (!match) continue;

    let name = match[1].trim();
    let relationship = match[2]?.trim() || 'connected';

    // Clean up name (remove parenthetical notes)
    name = name.replace(/\s*\([^)]+\)\s*/g, '').trim();

    // Skip if it's the source figure
    if (name.toLowerCase() === idToName.get(sourceFigureId)?.toLowerCase()) continue;

    const id = findFigureId(name);
    if (id && id !== sourceFigureId) {
      // Truncate relationship to reasonable length
      relationship = relationship.slice(0, 100);
      related.push({ id, name: idToName.get(id), relationship });
    }
  }

  // Dedupe by id
  const seen = new Set();
  return related.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  }).slice(0, 5); // Max 5 related figures
}

async function generateRelatedForFigure(figure) {
  const prompt = `List exactly 5 historical figures most closely connected to ${figure.canonical_name} (${figure.birth_year || 'unknown'}-${figure.death_year || 'unknown'}, ${figure.domain || 'historical figure'}).

IMPORTANT: Only name major, famous historical figures who would appear in a list of the 1000 most influential people in world history. No obscure or minor figures.

For each, give the name and a brief relationship description (2-5 words).

Format each on its own line like:
1. Name - relationship

Focus on direct connections: teachers, students, rivals, collaborators, family, or those they directly influenced or were influenced by. Prefer well-known figures from similar time periods.`;

  const response = await callOpenRouter(prompt);
  return parseRelatedFigures(response, figure.id);
}

async function main() {
  console.log(`🔗 Generating related figures for top ${LIMIT} figures`);
  console.log(`   Model: ${MODEL}`);
  console.log(`   Skip existing: ${SKIP_EXISTING}\n`);

  // Get top figures by LLM consensus rank
  let figures = db.prepare(`
    SELECT id, canonical_name, birth_year, death_year, domain, related_figures
    FROM figures
    WHERE llm_consensus_rank IS NOT NULL
    ORDER BY llm_consensus_rank ASC
    LIMIT ?
  `).all(LIMIT);

  if (SKIP_EXISTING) {
    const before = figures.length;
    figures = figures.filter(f => !f.related_figures);
    console.log(`   Skipping ${before - figures.length} figures with existing data\n`);
  }

  if (figures.length === 0) {
    console.log('✅ All figures already have related figures data');
    return;
  }

  console.log(`   Processing ${figures.length} figures...\n`);

  const updateStmt = db.prepare(`
    UPDATE figures SET related_figures = ? WHERE id = ?
  `);

  let processed = 0;
  let matched = 0;
  let errors = 0;

  for (let i = 0; i < figures.length; i++) {
    const fig = figures[i];

    try {
      const related = await generateRelatedForFigure(fig);

      if (related.length > 0) {
        updateStmt.run(JSON.stringify(related), fig.id);
        matched += related.length;
        console.log(`✓ ${fig.canonical_name}: ${related.map(r => r.name).join(', ')}`);
      } else {
        console.log(`○ ${fig.canonical_name}: no matches found`);
      }

      processed++;

      // Rate limit: ~1 request per second
      await new Promise(r => setTimeout(r, 1000));

      // Progress update every batch
      if ((i + 1) % BATCH_SIZE === 0) {
        console.log(`\n   Progress: ${i + 1}/${figures.length} (${matched} connections made)\n`);
      }
    } catch (err) {
      console.error(`✗ ${fig.canonical_name}: ${err.message}`);
      errors++;
      // Wait longer on error
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Total connections: ${matched}`);
  console.log(`   Errors: ${errors}`);

  db.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
