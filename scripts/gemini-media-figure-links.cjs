/**
 * Uses Gemini 2.5 Flash Lite to identify which historical figures
 * from the HistoryRank database are related to each media item.
 *
 * Usage:
 *   node scripts/gemini-media-figure-links.cjs [--batch-size=20] [--only-unlinked]
 *
 * Requires GEMINI_API_KEY or GOOGLE_API_KEY in .env.local
 */
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function loadEnvFile(fileName) {
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

const MEDIA_PATH = path.join(process.cwd(), 'data', 'raw', 'media', 'ucsc-history-media.jsonl');
const SUGGESTIONS_PATH = path.join(process.cwd(), 'data', 'media-figure-links.suggestions.json');
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'media-figure-links.gemini.json');

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

function loadMedia() {
  const raw = fs.readFileSync(MEDIA_PATH, 'utf8');
  const seenIds = new Map();
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .map((item) => {
      const baseId = item.id || slugify(item.title || '');
      const nextCount = (seenIds.get(baseId) || 0) + 1;
      seenIds.set(baseId, nextCount);
      const id = nextCount > 1 ? `${baseId}-${nextCount}` : baseId;
      return { ...item, id };
    });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { batchSize: 15, onlyUnlinked: false };
  for (const arg of args) {
    if (arg.startsWith('--batch-size=')) options.batchSize = Number(arg.slice('--batch-size='.length));
    if (arg === '--only-unlinked') options.onlyUnlinked = true;
  }
  return options;
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY or GOOGLE_API_KEY');

  const model = 'gemini-2.5-flash-lite';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4000,
        responseMimeType: 'application/json',
      },
    }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload) {
    const errMessage = payload?.error?.message || `Gemini error (${res.status})`;
    throw new Error(errMessage);
  }

  const rawText = (payload.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || '')
    .join('')
    .trim();
  if (!rawText) throw new Error('Gemini returned empty response');

  return JSON.parse(rawText);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const options = parseArgs();

  const db = new Database('historyrank.db', { readonly: true });
  const figures = db.prepare('select id, canonical_name from figures where canonical_name is not null order by llm_consensus_rank asc nulls last').all();
  db.close();

  const media = loadMedia();

  // Build set of already-linked media IDs
  let linkedIds = new Set();
  if (options.onlyUnlinked && fs.existsSync(SUGGESTIONS_PATH)) {
    const existing = JSON.parse(fs.readFileSync(SUGGESTIONS_PATH, 'utf8'));
    for (const item of existing.items || []) {
      linkedIds.add(item.media_id);
    }
  }

  // Filter to items that need linking
  let targets = media;
  if (options.onlyUnlinked) {
    targets = media.filter((item) => !linkedIds.has(item.id));
    console.log(`Processing ${targets.length} unlinked items (${linkedIds.size} already linked)`);
  } else {
    console.log(`Processing all ${targets.length} media items`);
  }

  // Build figure list string (top 200 for context, plus full list for matching)
  const figureNames = figures.map((f) => f.canonical_name);
  const figureListStr = figureNames.join('\n');

  const allResults = [];
  const batchSize = options.batchSize;

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(targets.length / batchSize);
    console.log(`\nBatch ${batchNum}/${totalBatches} (items ${i + 1}-${i + batch.length})`);

    const mediaDescriptions = batch.map((item, idx) => {
      const parts = [`${idx + 1}. "${item.title}" (${item.type || 'unknown'})`];
      if (item.release_year) parts.push(`  Year: ${item.release_year}`);
      if (item.tags?.length) parts.push(`  Tags: ${item.tags.join(', ')}`);
      if (item.summary) parts.push(`  Summary: ${item.summary.slice(0, 300)}`);
      if (item.notes) parts.push(`  Notes: ${item.notes.slice(0, 200)}`);
      return parts.join('\n');
    }).join('\n\n');

    const prompt = `You are a historian. For each media item below, identify which historical figures from the provided list it is most closely related to (depicts, is about, or was created by a figure on the list).

RULES:
- Only use figure names from the provided list (exact spelling).
- For each match, specify the relation: "about" (the figure is a main subject), "depicts" (the figure appears but isn't the main subject), or "created_by" (the figure created or inspired the work).
- Maximum 4 figures per media item.
- If no figures from the list are clearly related, return an empty array for that item.
- Be precise — only link figures who are genuinely depicted or discussed, not tangential connections.

FIGURE LIST:
${figureListStr}

MEDIA ITEMS:
${mediaDescriptions}

Return JSON array where each element has:
{
  "index": <1-based index matching the media item number>,
  "figures": [
    {"name": "<exact figure name from list>", "relation": "about|depicts|created_by"}
  ]
}`;

    try {
      const result = await callGemini(prompt);
      const items = Array.isArray(result) ? result : (result.items || result.results || []);

      for (const entry of items) {
        const idx = (entry.index || 0) - 1;
        if (idx < 0 || idx >= batch.length) continue;
        const mediaItem = batch[idx];

        const validFigures = (entry.figures || []).filter((f) => {
          const found = figures.find((fig) => fig.canonical_name === f.name);
          if (!found) {
            // Try case-insensitive match
            const loose = figures.find((fig) => fig.canonical_name.toLowerCase() === (f.name || '').toLowerCase());
            if (loose) {
              f.name = loose.canonical_name;
              f.figure_id = loose.id;
              return true;
            }
            return false;
          }
          f.figure_id = found.id;
          return true;
        });

        if (validFigures.length > 0) {
          allResults.push({
            media_id: mediaItem.id,
            title: mediaItem.title,
            type: mediaItem.type,
            release_year: mediaItem.release_year ?? null,
            links: validFigures.map((f) => ({
              figure_id: f.figure_id,
              figure_name: f.name,
              relation: f.relation || 'about',
              confidence: 0.85,
              source: 'gemini-flash-lite',
            })),
          });
          console.log(`  ${mediaItem.title}: ${validFigures.map((f) => f.name).join(', ')}`);
        }
      }
    } catch (err) {
      console.error(`  Batch ${batchNum} error: ${err.message}`);
      // Continue with next batch
    }

    // Rate limiting
    if (i + batchSize < targets.length) {
      await sleep(1500);
    }
  }

  // Save results
  const payload = {
    generated_at: new Date().toISOString(),
    model: 'gemini-2.5-flash-lite',
    total_processed: targets.length,
    total_with_links: allResults.length,
    items: allResults,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`\nSaved ${allResults.length} items with links to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
