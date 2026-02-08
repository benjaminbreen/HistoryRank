import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

type CliArgs = {
  outPath: string;
  maxPages: number | null;
};

type AllPagesRow = {
  pageid: number;
  ns: number;
  title: string;
};

type AllPagesResponse = {
  continue?: {
    apcontinue?: string;
    continue?: string;
  };
  query?: {
    allpages?: AllPagesRow[];
  };
};

type BritannicaIndexEntry = {
  pageTitle: string;
  entryTitle: string;
  url: string;
  matchKeys: string[];
};

type BritannicaIndexPayload = {
  generatedAt: string;
  source: 'en.wikisource.org';
  prefix: string;
  totalPagesFetched: number;
  entries: BritannicaIndexEntry[];
};

const BRITANNICA_PREFIX = '1911 Encyclopædia Britannica/';

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const match = argv.find((arg) => arg.startsWith(`${flag}=`));
    return match ? match.slice(flag.length + 1) : null;
  };

  const outPath =
    get('--out') || path.join(process.cwd(), 'data', 'corpora', 'britannica-1911-index.json');
  const maxPagesRaw = get('--max-pages');
  const maxPages = maxPagesRaw ? Number.parseInt(maxPagesRaw, 10) : null;

  if (maxPages !== null && (!Number.isFinite(maxPages) || maxPages <= 0)) {
    throw new Error('Invalid --max-pages. Use a positive integer.');
  }

  return { outPath, maxPages };
}

function normalizeNameKey(input: string): string {
  const ascii = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return ascii
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function stripTrailingParenthetical(input: string): string {
  return input.replace(/\s*\([^)]*\)\s*$/g, '').trim();
}

function stripHonorifics(input: string): string {
  return input
    .replace(/\b(sir|saint|st|lord|lady|dr|prof|mr|mrs|ms|rev|fr)\.?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function reorderCommaName(input: string): string | null {
  const segments = input.split(',').map((part) => part.trim()).filter(Boolean);
  if (segments.length < 2) return null;
  const [lastName, ...rest] = segments;
  const remainder = rest.join(' ');
  if (!lastName || !remainder) return null;
  return `${remainder} ${lastName}`.trim();
}

function buildEntryMatchKeys(entryTitle: string): string[] {
  const keys = new Set<string>();
  const candidates = new Set<string>();
  candidates.add(entryTitle);
  candidates.add(stripTrailingParenthetical(entryTitle));
  candidates.add(stripHonorifics(entryTitle));
  candidates.add(stripHonorifics(stripTrailingParenthetical(entryTitle)));

  const commaReordered = reorderCommaName(entryTitle);
  if (commaReordered) {
    candidates.add(commaReordered);
    candidates.add(stripHonorifics(commaReordered));
    candidates.add(stripTrailingParenthetical(commaReordered));
    candidates.add(stripHonorifics(stripTrailingParenthetical(commaReordered)));
  }

  for (const candidate of candidates) {
    const normalized = normalizeNameKey(candidate);
    if (!normalized) continue;
    keys.add(normalized);
  }

  return Array.from(keys);
}

function shouldKeepEntryTitle(entryTitle: string): boolean {
  if (!entryTitle) return false;
  if (entryTitle.includes('/')) return false;
  const lower = entryTitle.toLowerCase();
  if (
    /^(index|contents|preface|contributors|errata|addenda|abbreviations|plate|maps?)(\b|$)/.test(lower)
  ) {
    return false;
  }
  return true;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HistoryRank/1.0 (Britannica index build)' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchAllBritannicaTitles(maxPages: number | null): Promise<AllPagesRow[]> {
  const out: AllPagesRow[] = [];
  let apcontinue: string | null = null;

  while (true) {
    if (maxPages !== null && out.length >= maxPages) break;

    const params = new URLSearchParams({
      action: 'query',
      list: 'allpages',
      apnamespace: '0',
      apprefix: BRITANNICA_PREFIX,
      aplimit: 'max',
      format: 'json',
      utf8: '1',
    });
    if (apcontinue) params.set('apcontinue', apcontinue);

    const url = `https://en.wikisource.org/w/api.php?${params.toString()}`;
    const data = await fetchJson<AllPagesResponse>(url);
    if (!data) {
      throw new Error('Failed to fetch allpages results from Wikisource API.');
    }

    const rows = data.query?.allpages || [];
    out.push(...rows);

    apcontinue = data.continue?.apcontinue || null;
    if (!apcontinue) break;
  }

  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = await fetchAllBritannicaTitles(args.maxPages);

  const entries: BritannicaIndexEntry[] = rows
    .map((row) => {
      if (!row.title.startsWith(BRITANNICA_PREFIX)) return null;
      const entryTitle = row.title.slice(BRITANNICA_PREFIX.length).trim();
      if (!shouldKeepEntryTitle(entryTitle)) return null;
      const pageTitle = row.title.trim();
      return {
        pageTitle,
        entryTitle,
        url: `https://en.wikisource.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`,
        matchKeys: buildEntryMatchKeys(entryTitle),
      } satisfies BritannicaIndexEntry;
    })
    .filter((entry): entry is BritannicaIndexEntry => Boolean(entry));

  const payload: BritannicaIndexPayload = {
    generatedAt: new Date().toISOString(),
    source: 'en.wikisource.org',
    prefix: BRITANNICA_PREFIX,
    totalPagesFetched: rows.length,
    entries,
  };

  await mkdir(path.dirname(args.outPath), { recursive: true });
  await writeFile(args.outPath, JSON.stringify(payload, null, 2), 'utf8');

  console.log(
    `Wrote Britannica 1911 index: ${entries.length} entries (${rows.length} pages fetched) -> ${args.outPath}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
