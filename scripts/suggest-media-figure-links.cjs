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
const MANUAL_PATH = path.join(process.cwd(), 'data', 'media-figure-links.manual.json');
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
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

function buildDirectMatches(media, figures, aliasByFigure) {
  const matchesByMediaId = new Map();
  const multiWord = figures.filter((f) => f.canonical_name && f.canonical_name.trim().split(/\s+/).length >= 2);
  const singleWord = figures.filter((f) => f.canonical_name && f.canonical_name.trim().split(/\s+/).length === 1);

  // Build a lookup for tag-based matching: normalized short name → figure
  // e.g. "henry viii" → { id: "henry-viii-of-england", canonical_name: "Henry VIII of England" }
  const figureByShortName = new Map();
  for (const fig of figures) {
    if (!fig.canonical_name) continue;
    const norm = normalizeTitle(fig.canonical_name);
    figureByShortName.set(norm, fig);
    // Also index aliases
    const aliases = aliasByFigure.get(fig.id) || [];
    for (const alias of aliases) {
      const normAlias = normalizeTitle(alias);
      if (!figureByShortName.has(normAlias)) {
        figureByShortName.set(normAlias, fig);
      }
    }
  }

  for (const item of media) {
    const title = item.title || '';
    const notes = item.notes || '';
    const summary = item.summary || '';
    const tagList = Array.isArray(item.tags) ? item.tags : [];
    const tags = tagList.join(' ');
    const haystack = normalize(`${title} ${notes} ${summary} ${tags}`);

    const hits = [];
    const hitIds = new Set();

    // Strategy 1: Full canonical name match in haystack (title + notes + summary + tags)
    for (const fig of multiWord) {
      const canonical = fig.canonical_name;
      const regex = makeBoundaryRegex(normalize(canonical));
      if (regex.test(haystack)) {
        hits.push({ figure_id: fig.id, figure_name: canonical, relation: 'about', confidence: 0.8, source: 'text-match' });
        hitIds.add(fig.id);
        continue;
      }
      // Try aliases
      const aliasList = aliasByFigure.get(fig.id) || [];
      for (const alias of aliasList) {
        if (alias.length < 8) continue;
        const aliasRegex = makeBoundaryRegex(alias);
        if (aliasRegex.test(haystack)) {
          hits.push({ figure_id: fig.id, figure_name: canonical, relation: 'about', confidence: 0.7, source: `alias:${alias}` });
          hitIds.add(fig.id);
          break;
        }
      }
    }

    // Strategy 2: Individual tag → figure matching
    // Tags like "Henry VIII" should match figure "Henry VIII of England"
    // Tags like "Thomas Cromwell" should match figure "Thomas Cromwell"
    for (const tag of tagList) {
      const normTag = normalizeTitle(tag);
      // Skip short/generic tags
      if (normTag.length < 5 || normTag.split(/\s+/).length < 2) continue;

      // Direct tag lookup
      const directMatch = figureByShortName.get(normTag);
      if (directMatch && !hitIds.has(directMatch.id)) {
        hits.push({ figure_id: directMatch.id, figure_name: directMatch.canonical_name, relation: 'depicts', confidence: 0.85, source: 'tag-match' });
        hitIds.add(directMatch.id);
        continue;
      }

      // Check if any figure's canonical name starts with this tag
      // e.g., tag "Henry VIII" → figure "Henry VIII of England"
      for (const fig of multiWord) {
        if (hitIds.has(fig.id)) continue;
        const normCanonical = normalizeTitle(fig.canonical_name);
        if (normCanonical.startsWith(normTag + ' ') && normTag.length >= 8) {
          hits.push({ figure_id: fig.id, figure_name: fig.canonical_name, relation: 'depicts', confidence: 0.75, source: 'tag-prefix' });
          hitIds.add(fig.id);
          break;
        }
      }
    }

    // Strategy 3: Single-word figure name exact title match
    for (const fig of singleWord) {
      const canonical = fig.canonical_name;
      if (canonical.length < 5) continue;
      if (hitIds.has(fig.id)) continue;
      if (normalize(title) === normalize(canonical)) {
        hits.push({ figure_id: fig.id, figure_name: canonical, relation: 'about', confidence: 0.9, source: 'title-exact' });
        hitIds.add(fig.id);
      }
    }

    if (hits.length) {
      matchesByMediaId.set(item.id, hits);
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

function loadManualLinks(media, figuresByName, aliasToId) {
  if (!fs.existsSync(MANUAL_PATH)) return new Map();
  const manual = JSON.parse(fs.readFileSync(MANUAL_PATH, 'utf8'));
  const matchesByMediaId = new Map();

  // Build media lookup by normalized title + type
  const mediaByKey = new Map();
  for (const item of media) {
    const key = `${normalizeTitle(item.title)}|${(item.type || '').toLowerCase()}`;
    // May have duplicates (e.g., Wolf Hall series + Wolf Hall book) — store array
    const list = mediaByKey.get(key) || [];
    list.push(item);
    mediaByKey.set(key, list);
  }

  for (const entry of manual) {
    const key = `${normalizeTitle(entry.title)}|${(entry.type || '').toLowerCase()}`;
    const mediaItems = mediaByKey.get(key) || [];
    if (mediaItems.length === 0) continue;

    const figureId = mapNameToFigure(entry.figure_name, figuresByName, aliasToId);
    if (!figureId) {
      console.warn(`Manual link: figure "${entry.figure_name}" not found in database`);
      continue;
    }

    for (const item of mediaItems) {
      const existing = matchesByMediaId.get(item.id) || [];
      existing.push({
        figure_id: figureId,
        figure_name: entry.figure_name,
        relation: entry.relation || 'about',
        confidence: 1.0,
        source: 'manual',
      });
      matchesByMediaId.set(item.id, existing);
    }
  }

  return matchesByMediaId;
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
  const manualMatches = loadManualLinks(media, figuresByName, aliasToId);

  const shakespeareId = mapNameToFigure('William Shakespeare', figuresByName, aliasToId);
  const adaptationMatches = new Map();
  if (shakespeareId) {
    for (const item of media) {
      const haystack = normalize(`${item.title || ''} ${item.notes || ''} ${(item.tags || []).join(' ')}`);
      const matches = SHAKESPEARE_KEYWORDS.some((keyword) => {
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(haystack);
      });
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
    // Manual links have highest priority
    const manual = manualMatches.get(item.id) || [];
    const direct = directMatches.get(item.id) || [];
    const adaptation = adaptationMatches.get(item.id) || [];
    const merged = [...manual, ...direct, ...adaptation];
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
    model: 'local-rules+manual',
    total_media: media.length,
    total_with_links: combined.length,
    items: combined,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Saved suggestions to ${OUTPUT_PATH}`);
  console.log(`Items with links: ${combined.length}`);

  // Print stats by source
  const sourceCounts = {};
  for (const entry of combined) {
    for (const link of entry.links) {
      sourceCounts[link.source] = (sourceCounts[link.source] || 0) + 1;
    }
  }
  console.log('Links by source:', sourceCounts);
}

function figureById(id, figures) {
  return figures.find((fig) => fig.id === id) || null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
