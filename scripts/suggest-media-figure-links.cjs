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
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'media-figure-links.suggestions.json');

const SHAKESPEARE_KEYWORDS = [
  'shakespeare',
  'hamlet',
  'king lear',
  'macbeth',
  'othello',
  'romeo',
  'juliet',
  'richard iii',
  'henry v',
  'julius caesar',
];

function normalize(value) {
  return value.toLowerCase();
}

function normalizeTitle(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
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

function makeBoundaryRegex(name) {
  const escaped = name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
  return new RegExp(`\\\\b${escaped}\\\\b`, 'i');
}

function buildDirectMatches(media, figures, aliasByFigure) {
  const matchesByMediaId = new Map();
  const multiWord = figures.filter((f) => f.canonical_name && f.canonical_name.trim().split(/\\s+/).length >= 2);
  const singleWord = figures.filter((f) => f.canonical_name && f.canonical_name.trim().split(/\\s+/).length === 1);

  for (const item of media) {
    const title = item.title || '';
    const notes = item.notes || '';
    const tags = Array.isArray(item.tags) ? item.tags.join(' ') : '';
    const haystack = normalize(`${title} ${notes} ${tags}`);

    const hits = [];

    for (const fig of multiWord) {
      const canonical = fig.canonical_name;
      const regex = makeBoundaryRegex(normalize(canonical));
      if (regex.test(haystack)) {
        hits.push({ figure_id: fig.id, figure_name: canonical, relation: 'about', confidence: 0.8, source: 'text-match' });
        continue;
      }
      const aliasList = aliasByFigure.get(fig.id) || [];
      for (const alias of aliasList) {
        if (alias.length < 8) continue;
        const aliasRegex = makeBoundaryRegex(alias);
        if (aliasRegex.test(haystack)) {
          hits.push({ figure_id: fig.id, figure_name: canonical, relation: 'about', confidence: 0.7, source: `alias:${alias}` });
          break;
        }
      }
    }

    for (const fig of singleWord) {
      const canonical = fig.canonical_name;
      if (canonical.length < 5) continue;
      if (normalize(title) === normalize(canonical)) {
        hits.push({ figure_id: fig.id, figure_name: canonical, relation: 'about', confidence: 0.9, source: 'title-exact' });
      }
    }

    if (hits.length) {
      const dedup = new Map();
      for (const hit of hits) {
        if (!dedup.has(hit.figure_id)) dedup.set(hit.figure_id, hit);
      }
      matchesByMediaId.set(item.id, Array.from(dedup.values()));
    }
  }

  return matchesByMediaId;
}

function mapNameToFigure(name, figuresByName, aliasToId) {
  const normalized = normalizeTitle(name);
  const direct = figuresByName.get(normalized);
  if (direct) return direct;
  const aliasMatch = aliasToId.get(normalized);
  if (aliasMatch) return aliasMatch;
  return null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    limit: null,
  };
  for (const arg of args) {
    if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length));
  }
  return options;
}

async function main() {
  const options = parseArgs();
  const db = new Database('historyrank.db', { readonly: true });
  const figures = db.prepare('select id, canonical_name, llm_consensus_rank from figures').all();
  const aliases = db.prepare('select alias, figure_id from name_aliases').all();
  db.close();

  const aliasByFigure = new Map();
  const aliasToId = new Map();
  for (const row of aliases) {
    const figId = row.figure_id;
    const list = aliasByFigure.get(figId) || [];
    list.push(row.alias);
    aliasByFigure.set(figId, list);
    const normalized = normalizeTitle(row.alias);
    if (!aliasToId.has(normalized)) aliasToId.set(normalized, figId);
  }

  const figuresByName = new Map();
  for (const fig of figures) {
    if (!fig.canonical_name) continue;
    figuresByName.set(normalizeTitle(fig.canonical_name), fig.id);
  }

  const media = loadMedia();
  const directMatches = buildDirectMatches(media, figures, aliasByFigure);

  const shakespeareId = mapNameToFigure('William Shakespeare', figuresByName, aliasToId);
  const adaptationMatches = new Map();
  if (shakespeareId) {
    for (const item of media) {
      const haystack = normalize(`${item.title || ''} ${item.notes || ''} ${(item.tags || []).join(' ')}`);
      const matches = SHAKESPEARE_KEYWORDS.some((keyword) => haystack.includes(keyword));
      if (!matches) continue;
      const relation = haystack.includes('inspired') ? 'inspired_by' : 'adaptation';
      adaptationMatches.set(item.id, [{
        figure_id: shakespeareId,
        figure_name: 'William Shakespeare',
        relation,
        confidence: 0.6,
        source: 'adaptation-rule',
      }]);
    }
  }

  const combined = [];
  for (const item of media) {
    const links = [];
    const direct = directMatches.get(item.id) || [];
    const adaptation = adaptationMatches.get(item.id) || [];
    const merged = [...direct, ...adaptation];
    const seen = new Set();
    for (const link of merged) {
      if (seen.has(link.figure_id)) continue;
      seen.add(link.figure_id);
      const fig = figureById(link.figure_id, figures);
      links.push({
        figure_id: link.figure_id,
        figure_name: fig?.canonical_name || link.figure_name,
        relation: link.relation,
        confidence: link.confidence,
        source: link.source,
        figure_rank: fig?.llm_consensus_rank ?? null,
      });
    }
    if (links.length) {
      combined.push({
        media_id: item.id,
        title: item.title,
        type: item.type,
        release_year: item.release_year ?? null,
        links,
      });
    }
  }

  combined.sort((a, b) => (a.release_year ?? 0) - (b.release_year ?? 0));

  const payload = {
    generated_at: new Date().toISOString(),
    model: 'local-rules',
    total_media: media.length,
    total_with_links: combined.length,
    items: combined,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Saved suggestions to ${OUTPUT_PATH}`);
  console.log(`Items with links: ${combined.length}`);
}

function figureById(id, figures) {
  return figures.find((fig) => fig.id === id) || null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
