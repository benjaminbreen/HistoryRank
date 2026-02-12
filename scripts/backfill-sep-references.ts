import Database from 'better-sqlite3';
import path from 'node:path';

type CliArgs = {
  dbPath: string;
  top: number;
  offset: number;
  delayMs: number;
};

type FigureRow = {
  id: string;
  canonicalName: string;
};

type SepEntry = {
  slug: string;
  title: string;
  normalizedTitles: string[];
};

type SepIndex = {
  entries: SepEntry[];
  byNormalizedTitle: Map<string, SepEntry[]>;
};

type SepResolved = {
  publicationYear: number | null;
  paragraphs: string[];
};

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const match = argv.find((arg) => arg.startsWith(`${flag}=`));
    return match ? match.slice(flag.length + 1) : null;
  };

  const dbPath = get('--db') || path.join(process.cwd(), 'historyrank.db');
  const topRaw = get('--top');
  const top = topRaw ? Number.parseInt(topRaw, 10) : 1000;
  const offsetRaw = get('--offset');
  const offset = offsetRaw ? Number.parseInt(offsetRaw, 10) : 0;
  const delayRaw = get('--delay-ms');
  const delayMs = delayRaw ? Number.parseInt(delayRaw, 10) : 150;

  if (!Number.isFinite(top) || top < 1 || top > 5000) {
    throw new Error('Invalid --top. Use a number between 1 and 5000.');
  }
  if (!Number.isFinite(offset) || offset < 0 || offset > 10000) {
    throw new Error('Invalid --offset. Use a number between 0 and 10000.');
  }
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 5000) {
    throw new Error('Invalid --delay-ms. Use a number between 0 and 5000.');
  }

  return { dbPath, top, offset, delayMs };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ndash: '-',
    mdash: '—',
    lsquo: "'",
    rsquo: "'",
    ldquo: '"',
    rdquo: '"',
    hellip: '...',
  };

  return value
    .replace(/&#(\d+);/g, (_, digits: string) => {
      const code = Number.parseInt(digits, 10);
      if (!Number.isFinite(code)) return _;
      try {
        return String.fromCodePoint(code);
      } catch {
        return _;
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      if (!Number.isFinite(code)) return _;
      try {
        return String.fromCodePoint(code);
      } catch {
        return _;
      }
    })
    .replace(/&([a-zA-Z]+);/g, (full, key: string) => named[key] || full);
}

function stripHtmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\[[0-9]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSepTitleVariants(title: string): string[] {
  const variants = new Set<string>();
  const base = title.trim();
  if (!base) return [];

  variants.add(base);
  variants.add(base.replace(/\s*\[[^\]]+\]\s*/g, ' ').replace(/\s+/g, ' ').trim());
  variants.add(base.replace(/\s*\([^)]*\)\s*$/g, '').trim());

  if (base.includes(',')) {
    const parts = base.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      variants.add(`${parts.slice(1).join(' ')} ${parts[0]}`.trim());
    }
  }

  return Array.from(variants)
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function buildFigureNameVariants(name: string): string[] {
  const variants = new Set<string>();
  const base = name.trim();
  if (!base) return [];

  variants.add(base);
  variants.add(base.replace(/\s*\([^)]*\)\s*$/g, '').trim());

  const tokens = base.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    variants.add(`${tokens[tokens.length - 1]}, ${tokens.slice(0, -1).join(' ')}`);
  }

  return Array.from(variants)
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

async function fetchText(url: string, timeoutMs = 20_000): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HistoryRank/1.0 (SEP backfill)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadSepIndex(): Promise<SepIndex> {
  const html = await fetchText('https://plato.stanford.edu/contents.html');
  if (!html) {
    throw new Error('Failed to fetch SEP contents page.');
  }

  const entries: SepEntry[] = [];
  const byNormalizedTitle = new Map<string, SepEntry[]>();
  const linkPattern = /<a\s+href="entries\/([^"#/]+)\/"[^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) !== null) {
    const slug = match[1]?.trim();
    const rawTitle = stripHtmlToText(match[2] || '');
    if (!slug || !rawTitle) continue;
    const normalizedTitles = buildSepTitleVariants(rawTitle);
    const entry: SepEntry = { slug, title: rawTitle, normalizedTitles };
    entries.push(entry);
    for (const normalized of normalizedTitles) {
      const bucket = byNormalizedTitle.get(normalized) || [];
      bucket.push(entry);
      byNormalizedTitle.set(normalized, bucket);
    }
  }

  return { entries, byNormalizedTitle };
}

function pickBestSepEntry(figureName: string, index: SepIndex): { entry: SepEntry; matchedVariant: string } | null {
  const variants = buildFigureNameVariants(figureName);
  const canonicalNormalized = normalizeText(figureName);
  let best: { entry: SepEntry; matchedVariant: string; score: number } | null = null;

  for (const variant of variants) {
    const hits = index.byNormalizedTitle.get(variant) || [];
    for (const hit of hits) {
      let score = 0;
      if (variant === canonicalNormalized) score += 5;
      if (hit.normalizedTitles.includes(canonicalNormalized)) score += 4;
      if (hit.normalizedTitles.includes(variant)) score += 3;
      if (normalizeText(hit.title) === canonicalNormalized) score += 2;
      if (!best || score > best.score) {
        best = { entry: hit, matchedVariant: variant, score };
      }
    }
  }

  if (!best) return null;
  return { entry: best.entry, matchedVariant: best.matchedVariant };
}

function extractSepExcerptParagraphs(html: string): string[] {
  const preambleStart = html.indexOf('<div id="preamble"');
  const mainTextStart = html.indexOf('<div id="main-text"');
  const scoped =
    preambleStart !== -1 && mainTextStart !== -1 && mainTextStart > preambleStart
      ? html.slice(preambleStart, mainTextStart)
      : html;

  const paragraphs: string[] = [];
  const paragraphPattern = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = paragraphPattern.exec(scoped)) !== null) {
    const text = stripHtmlToText(match[1] || '');
    if (!text || text.length < 80) continue;
    paragraphs.push(text);
    if (paragraphs.length >= 2) break;
  }

  return paragraphs;
}

function extractSepPublicationYear(html: string): number | null {
  const pubInfoMatch = html.match(/<div id="pubinfo">[\s\S]*?<\/div>/i);
  if (!pubInfoMatch) return null;
  const text = stripHtmlToText(pubInfoMatch[0]);
  const years = text.match(/\b(1[6-9]\d{2}|20\d{2})\b/g);
  if (!years || years.length === 0) return null;
  const latest = years[years.length - 1];
  const parsed = Number.parseInt(latest, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function resolveSepEntry(slug: string): Promise<SepResolved | null> {
  const url = `https://plato.stanford.edu/entries/${slug}/`;
  const html = await fetchText(url);
  if (!html) return null;
  const paragraphs = extractSepExcerptParagraphs(html);
  if (paragraphs.length === 0) return null;

  return {
    publicationYear: extractSepPublicationYear(html),
    paragraphs,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = new Database(args.dbPath);
  db.exec('PRAGMA foreign_keys = ON;');

  const figures = db
    .prepare(
      `
      SELECT id, canonical_name AS canonicalName
      FROM figures
      WHERE llm_consensus_rank IS NOT NULL
      ORDER BY llm_consensus_rank ASC
      LIMIT ? OFFSET ?
      `
    )
    .all(args.top, args.offset) as FigureRow[];

  if (figures.length === 0) {
    db.close();
    console.log('No figure targets found.');
    return;
  }

  console.log(`Loading SEP index...`);
  const sepIndex = await loadSepIndex();
  console.log(`Loaded SEP index entries: ${sepIndex.entries.length}`);

  const upsert = db.prepare(`
    INSERT INTO figure_research_sources (
      figure_id, source_role, source_corpus, source_kind, title, author,
      publication_year, source_url, access_url, snippet, is_public_domain, confidence,
      curation_status, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(figure_id, source_url) DO UPDATE SET
      source_role = excluded.source_role,
      source_corpus = excluded.source_corpus,
      source_kind = excluded.source_kind,
      title = excluded.title,
      author = excluded.author,
      publication_year = excluded.publication_year,
      access_url = excluded.access_url,
      snippet = excluded.snippet,
      is_public_domain = excluded.is_public_domain,
      confidence = excluded.confidence,
      curation_status = excluded.curation_status,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at
  `);

  const slugCache = new Map<string, SepResolved | null>();
  let matched = 0;
  let insertedOrUpdated = 0;
  let fetchedEntries = 0;
  let unresolvedMatches = 0;

  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < figures.length; i += 1) {
    const figure = figures[i];
    const picked = pickBestSepEntry(figure.canonicalName, sepIndex);
    if (!picked) {
      continue;
    }
    matched += 1;

    let resolved = slugCache.get(picked.entry.slug);
    if (resolved === undefined) {
      resolved = await resolveSepEntry(picked.entry.slug);
      slugCache.set(picked.entry.slug, resolved);
      fetchedEntries += 1;
      if (args.delayMs > 0) {
        await sleep(args.delayMs);
      }
    }

    if (!resolved) {
      unresolvedMatches += 1;
      continue;
    }

    const sourceUrl = `https://plato.stanford.edu/entries/${picked.entry.slug}/`;
    const metadata = JSON.stringify({
      strategy: 'sep_backfill_v1',
      provider: 'sep',
      sep_slug: picked.entry.slug,
      sep_title: picked.entry.title,
      sep_url: sourceUrl,
      sep_excerpt_paragraphs: resolved.paragraphs,
      sep_excerpt_source: 'preamble_first_two_paragraphs',
      matched_variant: picked.matchedVariant,
    });

    upsert.run(
      figure.id,
      'reference',
      'other',
      'article',
      picked.entry.title,
      null,
      resolved.publicationYear,
      sourceUrl,
      sourceUrl,
      resolved.paragraphs.join('\n\n'),
      0,
      0.86,
      'auto',
      metadata,
      now,
      now
    );
    insertedOrUpdated += 1;

    if ((i + 1) % 100 === 0) {
      console.log(`[${i + 1}/${figures.length}] matched=${matched} upserted=${insertedOrUpdated}`);
    }
  }

  db.close();

  console.log(
    `SEP backfill complete: figures=${figures.length} matched=${matched} upserted=${insertedOrUpdated} fetchedEntries=${fetchedEntries} unresolvedMatches=${unresolvedMatches}`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
