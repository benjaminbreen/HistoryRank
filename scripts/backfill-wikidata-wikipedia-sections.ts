import path from 'node:path';
import Database from 'better-sqlite3';

type CliArgs = {
  dbPath: string;
  figureId: string | null;
  top: number;
  offset: number;
  delayMs: number;
  maxSections: number;
  sectionCharLimit: number;
  failFastThreshold: number;
  skipNetworkCheck: boolean;
  dryRun: boolean;
};

type FigureTarget = {
  id: string;
  canonicalName: string;
  wikipediaSlug: string | null;
  wikidataQid: string | null;
};

type WikidataFact = {
  propertyId: string;
  propertyLabel: string;
  value: string;
  order: number;
};

type WikipediaSectionExcerpt = {
  sectionTitle: string;
  sectionText: string;
  sectionIndex: number;
  sectionAnchor: string | null;
  sectionOrder: number;
};

type WikidataEntityJson = {
  entities?: Record<
    string,
    {
      claims?: Record<
        string,
        Array<{
          mainsnak?: {
            datavalue?: {
              value: unknown;
              type?: string;
            };
          };
        }>
      >;
    }
  >;
};

type WikidataLabelsResponse = {
  entities?: Record<
    string,
    {
      labels?: Record<string, { value?: string }>;
    }
  >;
};

type WikipediaExtractResponse = {
  query?: {
    pages?: Record<string, { extract?: string }>;
  };
};

type WikipediaSectionsResponse = {
  parse?: {
    sections?: Array<{
      index?: string;
      line?: string;
      anchor?: string;
      toclevel?: string;
    }>;
  };
};

type WikipediaSectionHtmlResponse = {
  parse?: {
    text?: string | { '*': string };
  };
};

const USER_AGENT = 'HistoryRank/1.0 (research enrichment)';
const WIKIDATA_ENTITY_API = 'https://www.wikidata.org/wiki/Special:EntityData/';
const WIKIDATA_WBGETENTITIES_API = 'https://www.wikidata.org/w/api.php';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

const FACT_PROPERTIES: Array<{ id: string; label: string; maxValues: number }> = [
  { id: 'P569', label: 'Date of birth', maxValues: 1 },
  { id: 'P570', label: 'Date of death', maxValues: 1 },
  { id: 'P19', label: 'Place of birth', maxValues: 1 },
  { id: 'P20', label: 'Place of death', maxValues: 1 },
  { id: 'P106', label: 'Occupation', maxValues: 3 },
  { id: 'P27', label: 'Country of citizenship', maxValues: 2 },
  { id: 'P69', label: 'Educated at', maxValues: 2 },
  { id: 'P101', label: 'Field of work', maxValues: 2 },
  { id: 'P800', label: 'Notable work', maxValues: 3 },
  { id: 'P39', label: 'Position held', maxValues: 2 },
];

const EXCLUDED_SECTION_TITLES = new Set([
  'references',
  'external links',
  'further reading',
  'citations',
  'notes',
  'see also',
  'bibliography',
  'sources',
]);

const fetchDiagnostics = {
  requests: 0,
  failures: 0,
  retries: 0,
  lastFailure: null as string | null,
};

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const match = argv.find((arg) => arg.startsWith(`${flag}=`));
    return match ? match.slice(flag.length + 1) : null;
  };

  const dbPath = get('--db') || path.join(process.cwd(), 'historyrank.db');
  const figureId = get('--figure-id');
  const topRaw = get('--top');
  const top = topRaw ? Number.parseInt(topRaw, 10) : 100;
  const offsetRaw = get('--offset');
  const offset = offsetRaw ? Number.parseInt(offsetRaw, 10) : 0;
  const delayRaw = get('--delay-ms');
  const delayMs = delayRaw ? Number.parseInt(delayRaw, 10) : 150;
  const maxSectionsRaw = get('--max-sections');
  const maxSections = maxSectionsRaw ? Number.parseInt(maxSectionsRaw, 10) : 5;
  const sectionCharLimitRaw = get('--section-char-limit');
  const sectionCharLimit = sectionCharLimitRaw ? Number.parseInt(sectionCharLimitRaw, 10) : 1200;
  const failFastRaw = get('--fail-fast-threshold');
  const failFastThreshold = failFastRaw ? Number.parseInt(failFastRaw, 10) : 12;
  const skipNetworkCheck = argv.includes('--skip-network-check');
  const dryRun = argv.includes('--dry-run');

  if (!Number.isFinite(top) || top < 1 || top > 5000) {
    throw new Error('Invalid --top. Use a number between 1 and 5000.');
  }
  if (!Number.isFinite(offset) || offset < 0 || offset > 5000) {
    throw new Error('Invalid --offset. Use a number between 0 and 5000.');
  }
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 5000) {
    throw new Error('Invalid --delay-ms. Use a number between 0 and 5000.');
  }
  if (!Number.isFinite(maxSections) || maxSections < 1 || maxSections > 20) {
    throw new Error('Invalid --max-sections. Use a number between 1 and 20.');
  }
  if (!Number.isFinite(sectionCharLimit) || sectionCharLimit < 120 || sectionCharLimit > 5000) {
    throw new Error('Invalid --section-char-limit. Use a number between 120 and 5000.');
  }
  if (!Number.isFinite(failFastThreshold) || failFastThreshold < 0 || failFastThreshold > 200) {
    throw new Error('Invalid --fail-fast-threshold. Use a number between 0 and 200.');
  }

  return {
    dbPath,
    figureId,
    top,
    offset,
    delayMs,
    maxSections,
    sectionCharLimit,
    failFastThreshold,
    skipNetworkCheck,
    dryRun,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string, attempt = 1): Promise<T | null> {
  fetchDiagnostics.requests += 1;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (res.status === 429 && attempt < 5) {
      fetchDiagnostics.retries += 1;
      fetchDiagnostics.lastFailure = `HTTP 429 for ${url}`;
      await sleep(900 * attempt);
      return fetchJson<T>(url, attempt + 1);
    }
    if (!res.ok) {
      fetchDiagnostics.failures += 1;
      fetchDiagnostics.lastFailure = `HTTP ${res.status} for ${url}`;
      return null;
    }
    return (await res.json()) as T;
  } catch {
    fetchDiagnostics.failures += 1;
    fetchDiagnostics.lastFailure = `Network error for ${url}`;
    if (attempt < 3) {
      fetchDiagnostics.retries += 1;
      await sleep(700 * attempt);
      return fetchJson<T>(url, attempt + 1);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function assertApiConnectivity(skipNetworkCheck: boolean): Promise<void> {
  if (skipNetworkCheck) return;

  const wikiParams = new URLSearchParams({
    action: 'query',
    meta: 'siteinfo',
    format: 'json',
    origin: '*',
  });
  const wikiProbe = await fetchJson<Record<string, unknown>>(`${WIKIPEDIA_API}?${wikiParams.toString()}`);
  if (!wikiProbe) {
    throw new Error(
      `Wikipedia API connectivity failed. Last fetch error: ${fetchDiagnostics.lastFailure || 'unknown'}.\n` +
      'Fix network/DNS first or rerun with --skip-network-check (not recommended).'
    );
  }

  const wikidataParams = new URLSearchParams({
    action: 'wbgetentities',
    ids: 'Q42',
    props: 'labels',
    languages: 'en',
    format: 'json',
    origin: '*',
  });
  const wikidataProbe = await fetchJson<WikidataLabelsResponse>(`${WIKIDATA_WBGETENTITIES_API}?${wikidataParams.toString()}`);
  if (!wikidataProbe?.entities?.Q42) {
    throw new Error(
      `Wikidata API connectivity failed. Last fetch error: ${fetchDiagnostics.lastFailure || 'unknown'}.\n` +
      'Fix network/DNS first or rerun with --skip-network-check (not recommended).'
    );
  }
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
    mdash: '-',
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

function parseHtmlText(value: string | { '*': string } | null | undefined): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value['*'] === 'string') return value['*'];
  return '';
}

function clipText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const clipped = value.slice(0, maxChars);
  const cutPoint = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('; '), clipped.lastIndexOf(': '));
  if (cutPoint > 160) return clipped.slice(0, cutPoint + 1).trim();
  return `${clipped.trim()}...`;
}

function formatYear(year: number): string {
  return year < 0 ? `${Math.abs(year)} BCE` : `${year}`;
}

function formatWikidataTime(value: unknown): string | null {
  const timeValue = value as { time?: string; precision?: number } | undefined;
  if (!timeValue?.time) return null;

  const match = timeValue.time.match(/^([+-])(\d+)-(\d{2})-(\d{2})/);
  if (!match) return null;

  const sign = match[1] === '-' ? -1 : 1;
  const year = sign * Number.parseInt(match[2], 10);
  const month = Number.parseInt(match[3], 10);
  const day = Number.parseInt(match[4], 10);
  const precision = typeof timeValue.precision === 'number' ? timeValue.precision : 9;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (precision >= 11 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
    return `${day} ${monthNames[month - 1]} ${formatYear(year)}`;
  }
  if (precision >= 10 && month >= 1 && month <= 12) {
    return `${monthNames[month - 1]} ${formatYear(year)}`;
  }
  return formatYear(year);
}

async function getWikidataQidFromSlug(slug: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'pageprops',
    ppprop: 'wikibase_item',
    titles: slug,
    redirects: '1',
    format: 'json',
    origin: '*',
  });
  const payload = await fetchJson<{ query?: { pages?: Record<string, { pageprops?: { wikibase_item?: string } }> } }>(
    `${WIKIPEDIA_API}?${params.toString()}`
  );
  const pages = payload?.query?.pages ? Object.values(payload.query.pages) : [];
  return pages[0]?.pageprops?.wikibase_item || null;
}

async function fetchWikidataLabels(ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((value) => /^[PQ]\d+$/i.test(value))));
  const labels = new Map<string, string>();
  if (unique.length === 0) return labels;

  for (let i = 0; i < unique.length; i += 45) {
    const chunk = unique.slice(i, i + 45);
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: chunk.join('|'),
      props: 'labels',
      languages: 'en',
      format: 'json',
      origin: '*',
    });
    const payload = await fetchJson<WikidataLabelsResponse>(`${WIKIDATA_WBGETENTITIES_API}?${params.toString()}`);
    if (!payload?.entities) continue;
    for (const [id, entity] of Object.entries(payload.entities)) {
      const label = entity.labels?.en?.value;
      if (label && label.trim().length > 0) labels.set(id, label.trim());
    }
  }
  return labels;
}

async function buildWikidataFacts(qid: string): Promise<WikidataFact[]> {
  const payload = await fetchJson<WikidataEntityJson>(`${WIKIDATA_ENTITY_API}${qid}.json`);
  const entity = payload?.entities?.[qid];
  if (!entity?.claims) return [];

  const facts: Array<{ propertyId: string; propertyLabel: string; value: string; order: number; rawEntityId?: string }> =
    [];

  for (const spec of FACT_PROPERTIES) {
    const claims = entity.claims[spec.id] || [];
    for (const claim of claims.slice(0, spec.maxValues)) {
      const datavalue = claim.mainsnak?.datavalue?.value;
      if (datavalue === null || datavalue === undefined) continue;

      if (spec.id === 'P569' || spec.id === 'P570') {
        const formatted = formatWikidataTime(datavalue);
        if (!formatted) continue;
        facts.push({
          propertyId: spec.id,
          propertyLabel: spec.label,
          value: formatted,
          order: FACT_PROPERTIES.findIndex((entry) => entry.id === spec.id),
        });
        continue;
      }

      const entityId = (datavalue as { id?: string }).id;
      if (typeof entityId === 'string' && /^[Q]\d+$/i.test(entityId)) {
        facts.push({
          propertyId: spec.id,
          propertyLabel: spec.label,
          value: entityId,
          order: FACT_PROPERTIES.findIndex((entry) => entry.id === spec.id),
          rawEntityId: entityId,
        });
        continue;
      }

      if (typeof datavalue === 'string' && datavalue.trim().length > 0) {
        facts.push({
          propertyId: spec.id,
          propertyLabel: spec.label,
          value: datavalue.trim(),
          order: FACT_PROPERTIES.findIndex((entry) => entry.id === spec.id),
        });
        continue;
      }
    }
  }

  if (facts.length === 0) return [];

  const idsNeedingLabels = facts
    .map((fact) => fact.rawEntityId)
    .filter((id): id is string => Boolean(id));
  const labelMap = await fetchWikidataLabels([...idsNeedingLabels, ...FACT_PROPERTIES.map((p) => p.id)]);

  return facts
    .map((fact) => ({
      propertyId: fact.propertyId,
      propertyLabel: labelMap.get(fact.propertyId) || fact.propertyLabel,
      value: fact.rawEntityId ? labelMap.get(fact.rawEntityId) || fact.value : fact.value,
      order: fact.order,
    }))
    .filter((fact) => fact.value.trim().length > 0);
}

async function fetchWikipediaLead(slug: string, maxChars: number): Promise<WikipediaSectionExcerpt | null> {
  const params = new URLSearchParams({
    action: 'query',
    titles: slug,
    redirects: '1',
    prop: 'extracts',
    exintro: '1',
    explaintext: '1',
    format: 'json',
    origin: '*',
  });
  const payload = await fetchJson<WikipediaExtractResponse>(`${WIKIPEDIA_API}?${params.toString()}`);
  const pages = payload?.query?.pages ? Object.values(payload.query.pages) : [];
  const extract = pages[0]?.extract?.trim();
  if (!extract || extract.length < 120) return null;

  return {
    sectionTitle: 'Lead',
    sectionText: clipText(extract.replace(/\s+/g, ' '), maxChars),
    sectionIndex: 0,
    sectionAnchor: null,
    sectionOrder: 0,
  };
}

async function fetchWikipediaSectionExcerpts(
  slug: string,
  maxSections: number,
  sectionCharLimit: number
): Promise<WikipediaSectionExcerpt[]> {
  const lead = await fetchWikipediaLead(slug, sectionCharLimit);
  const results: WikipediaSectionExcerpt[] = lead ? [lead] : [];

  const params = new URLSearchParams({
    action: 'parse',
    page: slug,
    prop: 'sections',
    redirects: '1',
    format: 'json',
    origin: '*',
  });
  const sectionsPayload = await fetchJson<WikipediaSectionsResponse>(`${WIKIPEDIA_API}?${params.toString()}`);
  const sections = sectionsPayload?.parse?.sections || [];
  if (sections.length === 0) return results.slice(0, maxSections);

  const selected = sections
    .filter((section) => {
      const line = (section.line || '').trim();
      const toclevel = Number.parseInt(section.toclevel || '0', 10);
      if (!line || !Number.isFinite(toclevel)) return false;
      if (toclevel > 2) return false;
      if (EXCLUDED_SECTION_TITLES.has(line.toLowerCase())) return false;
      return true;
    })
    .slice(0, Math.max(0, maxSections - results.length));

  for (const section of selected) {
    const index = Number.parseInt(section.index || '', 10);
    if (!Number.isFinite(index)) continue;

    const sectionParams = new URLSearchParams({
      action: 'parse',
      page: slug,
      prop: 'text',
      section: String(index),
      redirects: '1',
      format: 'json',
      origin: '*',
    });
    const sectionPayload = await fetchJson<WikipediaSectionHtmlResponse>(`${WIKIPEDIA_API}?${sectionParams.toString()}`);
    const html = parseHtmlText(sectionPayload?.parse?.text);
    if (!html) continue;

    const paragraphs = Array.from(html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
      .map((match) => stripHtmlToText(match[1] || ''))
      .filter((paragraph) => paragraph.length >= 80);
    if (paragraphs.length === 0) continue;

    const excerpt = clipText(paragraphs.slice(0, 2).join('\n\n'), sectionCharLimit);
    if (excerpt.length < 120) continue;

    results.push({
      sectionTitle: (section.line || '').trim() || `Section ${index}`,
      sectionText: excerpt,
      sectionIndex: index,
      sectionAnchor: section.anchor?.trim() || null,
      sectionOrder: results.length,
    });
  }

  return results.slice(0, maxSections);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await assertApiConnectivity(args.skipNetworkCheck);
  const db = new Database(args.dbPath);
  db.exec('PRAGMA foreign_keys = ON;');

  const targets = args.figureId
    ? (db
        .prepare(
          `
          SELECT id, canonical_name AS canonicalName, wikipedia_slug AS wikipediaSlug, wikidata_qid AS wikidataQid
          FROM figures
          WHERE id = ?
          LIMIT 1
          `
        )
        .all(args.figureId) as FigureTarget[])
    : (db
        .prepare(
          `
          SELECT id, canonical_name AS canonicalName, wikipedia_slug AS wikipediaSlug, wikidata_qid AS wikidataQid
          FROM figures
          WHERE llm_consensus_rank IS NOT NULL
          ORDER BY llm_consensus_rank ASC
          LIMIT ? OFFSET ?
          `
        )
        .all(args.top, args.offset) as FigureTarget[]);

  if (targets.length === 0) {
    db.close();
    console.log('No figure targets found.');
    return;
  }

  const deleteWikidataRows = db.prepare(
    `DELETE FROM figure_research_sources WHERE figure_id = ? AND source_url LIKE 'https://www.wikidata.org/wiki/%#wikidata-fact-%'`
  );
  const deleteWikipediaRows = db.prepare(
    `DELETE FROM figure_research_sources WHERE figure_id = ? AND source_url LIKE 'https://en.wikipedia.org/wiki/%#section-excerpt-%'`
  );

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

  const writeRows = db.transaction(
    (figureId: string, qid: string | null, slug: string | null, facts: WikidataFact[], sections: WikipediaSectionExcerpt[]) => {
      deleteWikidataRows.run(figureId);
      deleteWikipediaRows.run(figureId);
      const now = Math.floor(Date.now() / 1000);

      for (let i = 0; i < facts.length; i += 1) {
        const fact = facts[i];
        const sourceUrl = `https://www.wikidata.org/wiki/${qid}#wikidata-fact-${fact.propertyId}-${i + 1}`;
        upsert.run(
          figureId,
          'reference',
          'other',
          'archive_record',
          `Wikidata fact: ${fact.propertyLabel}`,
          'Wikidata',
          null,
          sourceUrl,
          qid ? `https://www.wikidata.org/wiki/${qid}` : null,
          fact.value,
          1,
          0.88,
          'auto',
          JSON.stringify({
            provider: 'wikidata',
            qid,
            fact_property_id: fact.propertyId,
            fact_property_label: fact.propertyLabel,
            fact_value: fact.value,
            fact_order: fact.order,
            ingestion: 'wikidata_facts_v1',
          }),
          now,
          now
        );
      }

      for (const section of sections) {
        const sourceUrl = `https://en.wikipedia.org/wiki/${slug}#section-excerpt-${section.sectionIndex}-${section.sectionOrder}`;
        const accessUrl = section.sectionAnchor
          ? `https://en.wikipedia.org/wiki/${slug}#${encodeURIComponent(section.sectionAnchor)}`
          : `https://en.wikipedia.org/wiki/${slug}`;

        upsert.run(
          figureId,
          'reference',
          'other',
          'article',
          `Wikipedia section: ${section.sectionTitle}`,
          'Wikipedia contributors',
          null,
          sourceUrl,
          accessUrl,
          section.sectionText,
          0,
          0.74,
          'auto',
          JSON.stringify({
            provider: 'wikipedia_sections',
            wikipedia_slug: slug,
            section_title: section.sectionTitle,
            section_index: section.sectionIndex,
            section_anchor: section.sectionAnchor,
            section_order: section.sectionOrder,
            section_text: section.sectionText,
            ingestion: 'wikipedia_sections_v1',
          }),
          now,
          now
        );
      }
    }
  );

  let figuresProcessed = 0;
  let figuresWithWikidata = 0;
  let figuresWithSections = 0;
  let wikidataFactsInserted = 0;
  let wikipediaSectionsInserted = 0;
  let consecutiveZeroResults = 0;
  let failFastTriggered = false;

  for (const target of targets) {
    figuresProcessed += 1;
    const slug = target.wikipediaSlug?.trim() || null;
    let qid = target.wikidataQid?.trim() || null;
    if (!qid && slug) {
      qid = await getWikidataQidFromSlug(slug);
    }

    const facts = qid ? await buildWikidataFacts(qid) : [];
    const sections = slug
      ? await fetchWikipediaSectionExcerpts(slug, args.maxSections, args.sectionCharLimit)
      : [];

    if (facts.length > 0) figuresWithWikidata += 1;
    if (sections.length > 0) figuresWithSections += 1;

    wikidataFactsInserted += facts.length;
    wikipediaSectionsInserted += sections.length;

    const hasEnoughInputs = Boolean(qid || slug);
    if (hasEnoughInputs && facts.length === 0 && sections.length === 0) {
      consecutiveZeroResults += 1;
    } else {
      consecutiveZeroResults = 0;
    }

    if (!args.dryRun) {
      writeRows(target.id, qid, slug, facts, sections);
    }

    if (figuresProcessed % 10 === 0 || figuresProcessed === targets.length) {
      console.log(
        `[${figuresProcessed}/${targets.length}] ${target.canonicalName}: ` +
          `${facts.length} wikidata facts, ${sections.length} wikipedia excerpts`
      );
    }

    if (args.delayMs > 0) {
      await sleep(args.delayMs);
    }

    if (args.failFastThreshold > 0 && consecutiveZeroResults >= args.failFastThreshold) {
      failFastTriggered = true;
      console.error(
        `Fail-fast: ${consecutiveZeroResults} consecutive figures produced zero Wikidata facts and zero Wikipedia excerpts.\n` +
        `Last fetch error: ${fetchDiagnostics.lastFailure || 'none recorded'}`
      );
      break;
    }
  }

  db.close();
  console.log(
    JSON.stringify(
      {
        mode: args.dryRun ? 'dry-run' : 'write',
        figuresProcessed,
        figuresWithWikidata,
        figuresWithSections,
        wikidataFactsInserted,
        wikipediaSectionsInserted,
        fetchDiagnostics,
        failFastTriggered,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
