import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type SourceRole = 'primary' | 'secondary' | 'reference';
type SourceCorpus =
  | 'wikisource'
  | 'internet_archive'
  | 'project_gutenberg'
  | 'openalex'
  | 'crossref'
  | 'openlibrary'
  | 'loc';
type SourceKind = 'text' | 'speech' | 'letter' | 'book' | 'article' | 'archive_record' | 'other';

type CandidateSource = {
  source_corpus: SourceCorpus;
  source_role: SourceRole;
  source_kind: SourceKind;
  title: string;
  author: string | null;
  publication_year: number | null;
  source_url: string;
  access_url?: string | null;
  snippet?: string | null;
  confidence: number;
  why: string;
  metadata?: Record<string, unknown>;
};

type CliArgs = {
  figureId: string | null;
  name: string | null;
  aliases: string[];
  roles: SourceRole[];
  limit: number;
  outDir: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const match = argv.find((arg) => arg.startsWith(`${flag}=`));
    return match ? match.slice(flag.length + 1) : null;
  };

  const figureId = get('--figure-id');
  const name = get('--name');
  const aliasesRaw = get('--aliases');
  const aliases = aliasesRaw
    ? aliasesRaw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  const rolesRaw = get('--roles') || 'primary,secondary,reference';
  const roles = rolesRaw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean) as SourceRole[];
  const outDir = get('--out-dir') || 'data/research-candidates';
  const limitRaw = get('--limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 12;
  const dryRun = argv.includes('--dry-run');

  if (!name) {
    throw new Error('Missing required argument: --name="Figure Name"');
  }

  if (!Number.isFinite(limit) || limit <= 0 || limit > 25) {
    throw new Error('Invalid --limit. Use a number between 1 and 25.');
  }

  const roleSet = new Set<SourceRole>();
  for (const role of roles) {
    if (role !== 'primary' && role !== 'secondary' && role !== 'reference') {
      throw new Error('Invalid --roles. Allowed values: primary,secondary,reference');
    }
    roleSet.add(role);
  }
  if (roleSet.size === 0) {
    throw new Error('No valid source roles selected. Use --roles=primary,secondary,reference');
  }

  return { figureId, name, aliases, roles: Array.from(roleSet), limit, outDir, dryRun };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeNameKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildQueryNames(name: string, aliases: string[]): string[] {
  const base = [name, ...aliases].map((value) => value.trim()).filter(Boolean);
  const tokens = name.trim().split(/\s+/);
  if (tokens.length > 1) {
    base.push(tokens[tokens.length - 1]);
  }

  const seen = new Set<string>();
  return base.filter((value) => {
    const key = normalizeNameKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

function inferSourceKind(title: string): SourceKind {
  const lower = title.toLowerCase();
  if (/(speech|address|oration|sermon)/.test(lower)) return 'speech';
  if (/(letter|epistle|correspondence)/.test(lower)) return 'letter';
  if (/(article|journal|review|proceedings|paper)/.test(lower)) return 'article';
  if (/(archive|catalog|record|collection)/.test(lower)) return 'archive_record';
  if (/(book|volume|novel|essays|memoirs|autobiography|treatise)/.test(lower)) return 'book';
  return 'text';
}

function likelySecondary(title: string, figureName: string): boolean {
  const lower = title.toLowerCase();
  const name = figureName.toLowerCase();
  if (/(biography|life of|about|studies|analysis|criticism|dictionary|encyclopedia)/.test(lower)) {
    return true;
  }
  if (lower.includes('letters of') && !name.includes('letter')) return true;
  return false;
}

function baseConfidence(title: string, figureName: string): number {
  const lower = title.toLowerCase();
  const names = figureName
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const last = names[names.length - 1] || '';
  let score = 0.55;

  if (names.length >= 2 && lower.includes(`${names[0]} ${last}`)) score += 0.2;
  if (last && lower.includes(last)) score += 0.1;
  if (inferSourceKind(title) === 'speech' || inferSourceKind(title) === 'letter') score += 0.08;
  if (likelySecondary(title, figureName)) score -= 0.22;

  return clampConfidence(score);
}

function secondaryConfidence(title: string, figureName: string, citedByCount: number | null): number {
  const lower = title.toLowerCase();
  const names = figureName
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const last = names[names.length - 1] || '';
  const full = names.join(' ');
  let score = 0.45;

  if (full && lower.includes(full)) score += 0.24;
  else if (last && lower.includes(last)) score += 0.14;

  if (/(biography|life|legacy|influence|thought|philosophy|works of|studies|analysis|history)/.test(lower)) {
    score += 0.08;
  }

  if (typeof citedByCount === 'number' && Number.isFinite(citedByCount)) {
    score += Math.min(0.16, Math.log10(Math.max(citedByCount, 1) + 1) * 0.08);
  }

  return clampConfidence(score);
}

function referenceConfidence(title: string, figureName: string): number {
  const lower = title.toLowerCase();
  const names = figureName
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const full = names.join(' ');
  const last = names[names.length - 1] || '';
  let score = 0.42;

  if (full && lower.includes(full)) score += 0.25;
  else if (last && lower.includes(last)) score += 0.13;
  if (/(biography|dictionary|catalog|encyclopedia|handbook|companion|reader)/.test(lower)) score += 0.08;

  return clampConfidence(score);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HistoryRank/1.0 (source discovery)' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWikisourceCandidates(name: string, limit: number): Promise<CandidateSource[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: name,
    srlimit: String(limit),
    format: 'json',
    utf8: '1',
  });

  const url = `https://en.wikisource.org/w/api.php?${params.toString()}`;
  const data = await fetchJson<{ query?: { search?: Array<{ title: string }> } }>(url);
  const rows = data?.query?.search || [];

  return rows.map((row) => {
    const title = row.title.trim();
    const confidence = baseConfidence(title, name);
    return {
      source_corpus: 'wikisource',
      source_role: 'primary',
      source_kind: inferSourceKind(title),
      title,
      author: null,
      publication_year: null,
      source_url: `https://en.wikisource.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      access_url: `https://en.wikisource.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      confidence,
      why: confidence >= 0.7 ? 'Title strongly matches figure; likely authored text.' : 'Potential authored text; requires review.',
    };
  });
}

async function fetchInternetArchiveCandidates(name: string, limit: number): Promise<CandidateSource[]> {
  const query = `(title:("${name}") OR creator:("${name}")) AND mediatype:(texts)`;
  const params = new URLSearchParams({
    q: query,
    fl: 'identifier,title,creator,year',
    rows: String(limit),
    page: '1',
    output: 'json',
  });
  const url = `https://archive.org/advancedsearch.php?${params.toString()}`;
  const data = await fetchJson<{
    response?: { docs?: Array<{ identifier?: string; title?: string; creator?: string; year?: string | number }> };
  }>(url);
  const docs = data?.response?.docs || [];

  return docs
    .filter((doc) => doc.identifier && doc.title)
    .map((doc) => {
      const title = String(doc.title).trim();
      const confidence = baseConfidence(title, name);
      const yearRaw = doc.year == null ? null : Number.parseInt(String(doc.year), 10);
      return {
        source_corpus: 'internet_archive',
        source_role: 'primary',
        source_kind: inferSourceKind(title),
        title,
        author: doc.creator ? String(doc.creator) : null,
        publication_year: Number.isFinite(yearRaw) ? yearRaw : null,
        source_url: `https://archive.org/details/${doc.identifier}`,
        access_url: `https://archive.org/details/${doc.identifier}`,
        confidence,
        why: confidence >= 0.7 ? 'Archive text record likely authored by figure.' : 'Archive record may be relevant; review for authorship.',
        metadata: { source_api: 'internet_archive_primary' },
      };
    });
}

async function fetchGutenbergCandidates(name: string, limit: number): Promise<CandidateSource[]> {
  const url = `https://gutendex.com/books/?search=${encodeURIComponent(name)}`;
  const data = await fetchJson<{
    results?: Array<{
      id: number;
      title?: string;
      authors?: Array<{ name?: string }>;
      copyright?: boolean;
    }>;
  }>(url);
  const results = (data?.results || []).slice(0, limit);

  return results
    .filter((row) => row.id && row.title)
    .map((row) => {
      const title = String(row.title).trim();
      const confidence = baseConfidence(title, name);
      const author = row.authors?.[0]?.name ? String(row.authors[0].name) : null;
      return {
        source_corpus: 'project_gutenberg',
        source_role: 'primary',
        source_kind: inferSourceKind(title),
        title,
        author,
        publication_year: null,
        source_url: `https://www.gutenberg.org/ebooks/${row.id}`,
        access_url: `https://www.gutenberg.org/ebooks/${row.id}`,
        confidence,
        why: confidence >= 0.7 ? 'Public-domain title likely authored by figure.' : 'Candidate Gutenberg title; verify authorship.',
      };
    });
}

async function fetchOpenAlexSecondaryCandidates(name: string, limit: number): Promise<CandidateSource[]> {
  const params = new URLSearchParams({
    search: name,
    per_page: String(limit),
    sort: 'cited_by_count:desc',
  });
  const url = `https://api.openalex.org/works?${params.toString()}`;
  const data = await fetchJson<{
    results?: Array<{
      id?: string;
      doi?: string;
      display_name?: string;
      type?: string;
      publication_year?: number;
      cited_by_count?: number;
      primary_location?: {
        landing_page_url?: string | null;
        pdf_url?: string | null;
        source?: { display_name?: string | null } | null;
      } | null;
      authorships?: Array<{ author?: { display_name?: string | null } | null }>;
      abstract_inverted_index?: Record<string, number[]>;
    }>;
  }>(url);
  const rows = data?.results || [];

  return rows
    .filter((row) => typeof row.display_name === 'string' && row.display_name.trim().length > 0)
    .map((row) => {
      const title = String(row.display_name).trim();
      const citedByCount = typeof row.cited_by_count === 'number' ? row.cited_by_count : null;
      const confidence = secondaryConfidence(title, name, citedByCount);
      const doi = row.doi ? String(row.doi).trim() : null;
      const doiUrl = doi
        ? doi.startsWith('http')
          ? doi
          : `https://doi.org/${doi.replace(/^doi:\s*/i, '')}`
        : null;
      const sourceUrl = doiUrl || row.id || '';
      const accessUrl = row.primary_location?.landing_page_url || row.primary_location?.pdf_url || sourceUrl;

      return {
        source_corpus: 'openalex',
        source_role: 'secondary',
        source_kind: row.type === 'book' ? 'book' : 'article',
        title,
        author: row.authorships?.[0]?.author?.display_name ?? null,
        publication_year: typeof row.publication_year === 'number' ? row.publication_year : null,
        source_url: sourceUrl,
        access_url: accessUrl || null,
        snippet: row.primary_location?.source?.display_name || null,
        confidence,
        why:
          confidence >= 0.72
            ? 'High-confidence scholarly lead from OpenAlex with strong title/name match.'
            : 'Secondary scholarship candidate from OpenAlex; review relevance.',
        metadata: {
          provider: 'openalex',
          cited_by_count: citedByCount,
          openalex_id: row.id ?? null,
          work_type: row.type ?? null,
          venue: row.primary_location?.source?.display_name ?? null,
        },
      };
    })
    .filter((row) => row.source_url.length > 0);
}

async function fetchCrossrefSecondaryCandidates(name: string, limit: number): Promise<CandidateSource[]> {
  const params = new URLSearchParams({
    rows: String(limit),
    'query.bibliographic': name,
    select: 'DOI,title,author,issued,container-title,type,is-referenced-by-count,URL',
  });
  const url = `https://api.crossref.org/works?${params.toString()}`;
  const data = await fetchJson<{
    message?: {
      items?: Array<{
        DOI?: string;
        URL?: string;
        title?: string[];
        type?: string;
        author?: Array<{ given?: string; family?: string }>;
        issued?: { 'date-parts'?: number[][] };
        'container-title'?: string[];
        'is-referenced-by-count'?: number;
      }>;
    };
  }>(url);
  const rows = data?.message?.items || [];

  return rows
    .filter((row) => row.title?.[0])
    .map((row) => {
      const title = String(row.title![0]).trim();
      const citedByCount =
        typeof row['is-referenced-by-count'] === 'number' ? row['is-referenced-by-count'] : null;
      const confidence = secondaryConfidence(title, name, citedByCount);
      const authorObj = row.author?.[0];
      const author =
        authorObj && (authorObj.given || authorObj.family)
          ? [authorObj.given, authorObj.family].filter(Boolean).join(' ')
          : null;
      const year = row.issued?.['date-parts']?.[0]?.[0];
      const doiUrl = row.DOI ? `https://doi.org/${row.DOI}` : null;
      const sourceUrl = row.URL || doiUrl || '';

      return {
        source_corpus: 'crossref',
        source_role: 'secondary',
        source_kind: row.type?.includes('book') ? 'book' : 'article',
        title,
        author,
        publication_year: typeof year === 'number' ? year : null,
        source_url: sourceUrl,
        access_url: sourceUrl || null,
        snippet: row['container-title']?.[0] || null,
        confidence,
        why:
          confidence >= 0.7
            ? 'High-confidence secondary source lead from Crossref.'
            : 'Crossref bibliographic candidate; review relevance.',
        metadata: {
          provider: 'crossref',
          doi: row.DOI ?? null,
          referenced_by_count: citedByCount,
          container_title: row['container-title']?.[0] ?? null,
          work_type: row.type ?? null,
        },
      };
    })
    .filter((row) => row.source_url.length > 0);
}

async function fetchOpenLibraryReferenceCandidates(name: string, limit: number): Promise<CandidateSource[]> {
  const params = new URLSearchParams({
    q: `${name} biography`,
    limit: String(limit),
  });
  const url = `https://openlibrary.org/search.json?${params.toString()}`;
  const data = await fetchJson<{
    docs?: Array<{
      key?: string;
      title?: string;
      author_name?: string[];
      first_publish_year?: number;
      edition_count?: number;
      subject?: string[];
    }>;
  }>(url);
  const rows = data?.docs || [];

  return rows
    .filter((row) => row.key && row.title)
    .map((row) => {
      const title = String(row.title).trim();
      const confidence = referenceConfidence(title, name);
      return {
        source_corpus: 'openlibrary',
        source_role: 'reference',
        source_kind: 'book',
        title,
        author: row.author_name?.[0] || null,
        publication_year: typeof row.first_publish_year === 'number' ? row.first_publish_year : null,
        source_url: `https://openlibrary.org${row.key}`,
        access_url: `https://openlibrary.org${row.key}`,
        confidence,
        why:
          confidence >= 0.68
            ? 'Reference catalog lead from Open Library with strong figure-title match.'
            : 'Open Library catalog lead for review.',
        metadata: {
          provider: 'openlibrary',
          edition_count: row.edition_count ?? null,
          subjects: row.subject?.slice(0, 5) || [],
        },
      };
    });
}

async function fetchLibraryOfCongressReferenceCandidates(
  name: string,
  limit: number
): Promise<CandidateSource[]> {
  const params = new URLSearchParams({
    q: name,
    fo: 'json',
    c: String(limit),
  });
  const url = `https://www.loc.gov/books/?${params.toString()}`;
  const data = await fetchJson<{
    results?: Array<{
      title?: string;
      date?: string;
      url?: string;
      description?: string[] | null;
      contributor?: string[] | null;
      item?: { id?: string } | null;
    }>;
  }>(url);
  const rows = data?.results || [];

  return rows
    .filter((row) => row.title && row.url)
    .map((row) => {
      const title = String(row.title).trim();
      const confidence = referenceConfidence(title, name);
      const yearMatch = row.date?.match(/(-?\d{3,4})/);
      const year = yearMatch ? Number.parseInt(yearMatch[1], 10) : null;
      return {
        source_corpus: 'loc',
        source_role: 'reference',
        source_kind: 'archive_record',
        title,
        author: row.contributor?.[0] || null,
        publication_year: Number.isFinite(year) ? year : null,
        source_url: row.url!,
        access_url: row.url!,
        snippet: row.description?.[0] || null,
        confidence,
        why:
          confidence >= 0.67
            ? 'Library of Congress catalog lead with strong title match.'
            : 'Library of Congress catalog lead for manual review.',
        metadata: {
          provider: 'loc',
          loc_item_id: row.item?.id ?? null,
        },
      };
    });
}

type SeedPayload = Record<string, CandidateSource[]>;

async function loadSeedCandidates(figureName: string, figureId: string): Promise<CandidateSource[]> {
  const seedsPath = path.join(process.cwd(), 'data', 'research-seeds', 'primary-sources.en.json');
  try {
    const raw = await readFile(seedsPath, 'utf8');
    const seeds = JSON.parse(raw) as SeedPayload;
    const keys = new Set<string>([
      normalizeNameKey(figureName),
      normalizeNameKey(figureId.replace(/-/g, ' ')),
      figureId,
    ]);
    const matches: CandidateSource[] = [];
    for (const [key, value] of Object.entries(seeds)) {
      if (!keys.has(normalizeNameKey(key))) continue;
      if (!Array.isArray(value)) continue;
      matches.push(...value);
    }
    return matches;
  } catch {
    return [];
  }
}

function dedupeAndRank(
  candidates: CandidateSource[],
  figureName: string,
  roles: SourceRole[],
  limit: number
): CandidateSource[] {
  const seen = new Set<string>();
  const filtered = candidates.filter((candidate) => {
    if (candidate.source_role === 'primary' && likelySecondary(candidate.title, figureName)) return false;
    const key = `${candidate.source_role}::${candidate.source_corpus}::${candidate.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const orderedRoles: SourceRole[] = ['primary', 'secondary', 'reference'].filter((role) =>
    roles.includes(role)
  ) as SourceRole[];
  const baseLimit = Math.max(1, Math.floor(limit / orderedRoles.length));
  let remainder = Math.max(0, limit - baseLimit * orderedRoles.length);
  const perRoleLimit = new Map<SourceRole, number>();
  for (const role of orderedRoles) {
    const bonus = remainder > 0 ? 1 : 0;
    perRoleLimit.set(role, baseLimit + bonus);
    if (remainder > 0) remainder -= 1;
  }

  const collected: CandidateSource[] = [];
  for (const role of orderedRoles) {
    const roleRows = filtered
      .filter((row) => row.source_role === role)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, perRoleLimit.get(role));
    collected.push(...roleRows);
  }

  return collected.sort((a, b) => {
    if (a.source_role !== b.source_role) {
      return orderedRoles.indexOf(a.source_role) - orderedRoles.indexOf(b.source_role);
    }
    return b.confidence - a.confidence;
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const figureName = args.name!;
  const figureId = args.figureId || slugify(figureName);
  const queryNames = buildQueryNames(figureName, args.aliases);
  const perQueryLimit = Math.max(args.limit, 5);

  const fetchedPerQuery = await Promise.all(
    queryNames.map(async (queryName) => {
      const jobs: Array<Promise<CandidateSource[]>> = [];
      if (args.roles.includes('primary')) {
        jobs.push(fetchWikisourceCandidates(queryName, perQueryLimit));
        jobs.push(fetchInternetArchiveCandidates(queryName, perQueryLimit));
        jobs.push(fetchGutenbergCandidates(queryName, perQueryLimit));
      }
      if (args.roles.includes('secondary')) {
        jobs.push(fetchOpenAlexSecondaryCandidates(queryName, perQueryLimit));
        jobs.push(fetchCrossrefSecondaryCandidates(queryName, perQueryLimit));
      }
      if (args.roles.includes('reference')) {
        jobs.push(fetchOpenLibraryReferenceCandidates(queryName, perQueryLimit));
        jobs.push(fetchLibraryOfCongressReferenceCandidates(queryName, perQueryLimit));
      }
      const resultSets = await Promise.all(jobs);
      return resultSets.flat();
    })
  );

  const fetchedCandidates = fetchedPerQuery.flat();
  const seedCandidates = args.roles.includes('primary')
    ? await loadSeedCandidates(figureName, figureId)
    : [];
  const candidates = dedupeAndRank(
    [...seedCandidates, ...fetchedCandidates],
    figureName,
    args.roles,
    Math.max(args.limit, 8)
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    figureId,
    figureName,
    constraints: {
      language: 'en',
      sourceRoles: args.roles,
      corpora: Array.from(new Set(candidates.map((row) => row.source_corpus))),
      queryNames,
      seedFallbackUsed: seedCandidates.length > 0,
    },
    candidates,
  };

  if (args.dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  await mkdir(args.outDir, { recursive: true });
  const outputName =
    args.roles.length === 1 && args.roles[0] === 'primary'
      ? `${figureId}.primary-sources.json`
      : `${figureId}.research-sources.json`;
  const outputPath = path.join(args.outDir, outputName);
  await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Wrote ${candidates.length} candidates to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
