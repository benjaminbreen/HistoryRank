/**
 * Wikidata and Wikipedia API utilities for HistoryRank enrichment
 *
 * Two-source approach:
 * - Wikipedia: existence validation, search, thumbnails, extracts
 * - Wikidata: structured metadata (dates, coordinates, occupations)
 */

// API endpoints
const WIKI_SEARCH_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_PAGEPROPS_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_SUMMARY_API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const WIKIDATA_ENTITY_API = 'https://www.wikidata.org/wiki/Special:EntityData/';

// Wikidata property IDs
const PROPS = {
  INSTANCE_OF: 'P31',
  BIRTH_DATE: 'P569',
  DEATH_DATE: 'P570',
  BIRTH_PLACE: 'P19',
  DEATH_PLACE: 'P20',
  COORDINATES: 'P625',
  OCCUPATION: 'P106',
  CITIZENSHIP: 'P27',
  COUNTRY: 'P17',
  IMAGE: 'P18',
} as const;

// Human Q-ID for filtering
const HUMAN_QID = 'Q5';

// Types
export interface WikiSearchResult {
  title: string;
  slug: string;
  snippet: string;
  pageid: number;
}

export interface WikidataDate {
  year: number | null;
  month?: number;
  day?: number;
  precision: number;
}

export interface WikidataCoords {
  lat: number;
  lon: number;
}

export interface WikidataOccupation {
  qid: string;
  label: string;
}

export interface WikidataEntity {
  qid: string;
  label: string;
  description: string | null;
  isHuman: boolean;
  birthDate: WikidataDate | null;
  deathDate: WikidataDate | null;
  birthPlace: {
    qid: string;
    label: string;
    coords: WikidataCoords | null;
  } | null;
  occupations: WikidataOccupation[];
  citizenship: string | null;
  imageFilename: string | null;
}

export interface WikipediaSummary {
  title: string;
  extract: string;
  description: string | null;
  thumbnailUrl: string | null;
}

export interface EnrichmentData {
  // Identifiers
  wikidataQid: string;
  wikipediaSlug: string;

  // Basic info
  canonicalName: string;
  birthYear: number | null;
  deathYear: number | null;

  // Geography
  birthPlace: string | null;
  birthLat: number | null;
  birthLon: number | null;

  // Classification
  occupation: string | null;

  // Content
  wikipediaExtract: string | null;
  thumbnailUrl: string | null;

  // Confidence
  confidence: 'high' | 'medium' | 'low';
  confidenceReasons: string[];
}

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 100; // ms between requests

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await sleep(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();

  return fetch(url, {
    headers: { 'User-Agent': 'HistoryRank/1.0 (educational project; contact: historyrank@example.com)' }
  });
}

async function fetchJson<T>(url: string, attempt = 1): Promise<T | null> {
  try {
    const res = await rateLimitedFetch(url);

    if (res.status === 429 && attempt <= 5) {
      const retryAfter = Number(res.headers.get('retry-after') || 0);
      const delay = Math.max(1000, retryAfter * 1000, attempt * 1500);
      console.log(`    Rate limited, waiting ${delay}ms...`);
      await sleep(delay);
      return fetchJson<T>(url, attempt + 1);
    }

    if (!res.ok) {
      return null;
    }

    return await res.json() as T;
  } catch (error) {
    if (attempt <= 3) {
      await sleep(1000 * attempt);
      return fetchJson<T>(url, attempt + 1);
    }
    return null;
  }
}

/**
 * Search Wikipedia for a name
 */
export async function searchWikipedia(query: string, limit = 5): Promise<WikiSearchResult[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: String(limit),
    srinfo: 'totalhits',
    srprop: 'snippet',
    format: 'json',
    origin: '*',
  });

  const url = `${WIKI_SEARCH_API}?${params}`;
  const data = await fetchJson<{
    query?: {
      search?: Array<{
        title: string;
        pageid: number;
        snippet: string;
      }>;
    };
  }>(url);

  if (!data?.query?.search) return [];

  return data.query.search.map(r => ({
    title: r.title,
    slug: r.title.replace(/ /g, '_'),
    snippet: r.snippet.replace(/<[^>]+>/g, ''), // Strip HTML
    pageid: r.pageid,
  }));
}

/**
 * Get Wikidata QID from Wikipedia slug
 */
export async function getWikidataQid(wikipediaSlug: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'pageprops',
    ppprop: 'wikibase_item',
    titles: wikipediaSlug,
    format: 'json',
    origin: '*',
  });

  const url = `${WIKI_PAGEPROPS_API}?${params}`;
  const data = await fetchJson<{
    query?: {
      pages?: Record<string, {
        pageprops?: {
          wikibase_item?: string;
        };
      }>;
    };
  }>(url);

  if (!data?.query?.pages) return null;

  const pages = Object.values(data.query.pages);
  return pages[0]?.pageprops?.wikibase_item || null;
}

/**
 * Fetch and parse Wikidata entity
 */
export async function fetchWikidataEntity(qid: string): Promise<WikidataEntity | null> {
  const url = `${WIKIDATA_ENTITY_API}${qid}.json`;
  const data = await fetchJson<{
    entities?: Record<string, {
      labels?: Record<string, { value: string }>;
      descriptions?: Record<string, { value: string }>;
      claims?: Record<string, Array<{
        mainsnak?: {
          datavalue?: {
            value: unknown;
            type: string;
          };
        };
      }>>;
    }>;
  }>(url);

  if (!data?.entities?.[qid]) return null;

  const entity = data.entities[qid];

  // Helper to get claim values
  const getClaims = (prop: string) => entity.claims?.[prop] || [];

  const getFirstClaimValue = <T>(prop: string): T | null => {
    const claims = getClaims(prop);
    return claims[0]?.mainsnak?.datavalue?.value as T || null;
  };

  // Check if human
  const instanceOf = getClaims(PROPS.INSTANCE_OF);
  const isHuman = instanceOf.some(claim => {
    const value = claim.mainsnak?.datavalue?.value as { id?: string } | undefined;
    return value?.id === HUMAN_QID;
  });

  // Parse birth/death dates
  const parseDateClaim = (prop: string): WikidataDate | null => {
    const value = getFirstClaimValue<{
      time?: string;
      precision?: number;
    }>(prop);

    if (!value?.time) return null;

    // Time format: +YYYY-MM-DDT00:00:00Z or -YYYY-MM-DDT00:00:00Z
    const match = value.time.match(/^([+-])(\d+)-(\d{2})-(\d{2})/);
    if (!match) return null;

    const sign = match[1] === '-' ? -1 : 1;
    const year = sign * parseInt(match[2]);
    const month = parseInt(match[3]);
    const day = parseInt(match[4]);

    return {
      year,
      month: month > 0 ? month : undefined,
      day: day > 0 ? day : undefined,
      precision: value.precision || 9, // 9 = year precision
    };
  };

  // Parse coordinates
  const parseCoords = (value: unknown): WikidataCoords | null => {
    const v = value as { latitude?: number; longitude?: number } | undefined;
    if (!v || typeof v.latitude !== 'number' || typeof v.longitude !== 'number') return null;
    return { lat: v.latitude, lon: v.longitude };
  };

  // Parse birthplace with coordinates
  const parseBirthPlace = async (): Promise<WikidataEntity['birthPlace']> => {
    const value = getFirstClaimValue<{ id?: string }>(PROPS.BIRTH_PLACE);
    if (!value?.id) return null;

    // Fetch the birthplace entity to get label and coords
    const placeData = await fetchJson<{
      entities?: Record<string, {
        labels?: Record<string, { value: string }>;
        claims?: Record<string, Array<{
          mainsnak?: { datavalue?: { value: unknown } };
        }>>;
      }>;
    }>(`${WIKIDATA_ENTITY_API}${value.id}.json`);

    if (!placeData?.entities?.[value.id]) return null;

    const placeEntity = placeData.entities[value.id];
    const label = placeEntity.labels?.en?.value || null;

    // Get coordinates from the place
    const coordsClaim = placeEntity.claims?.[PROPS.COORDINATES]?.[0];
    const coords = parseCoords(coordsClaim?.mainsnak?.datavalue?.value);

    return label ? { qid: value.id, label, coords } : null;
  };

  // Parse occupations
  const parseOccupations = async (): Promise<WikidataOccupation[]> => {
    const claims = getClaims(PROPS.OCCUPATION);
    const occupations: WikidataOccupation[] = [];

    for (const claim of claims.slice(0, 5)) { // Limit to first 5
      const value = claim.mainsnak?.datavalue?.value as { id?: string } | undefined;
      if (!value?.id) continue;

      // Fetch occupation label
      const occData = await fetchJson<{
        entities?: Record<string, {
          labels?: Record<string, { value: string }>;
        }>;
      }>(`${WIKIDATA_ENTITY_API}${value.id}.json`);

      const label = occData?.entities?.[value.id]?.labels?.en?.value;
      if (label) {
        occupations.push({ qid: value.id, label });
      }
    }

    return occupations;
  };

  // Parse citizenship
  const parseCitizenship = async (): Promise<string | null> => {
    const value = getFirstClaimValue<{ id?: string }>(PROPS.CITIZENSHIP);
    if (!value?.id) return null;

    const countryData = await fetchJson<{
      entities?: Record<string, {
        labels?: Record<string, { value: string }>;
      }>;
    }>(`${WIKIDATA_ENTITY_API}${value.id}.json`);

    return countryData?.entities?.[value.id]?.labels?.en?.value || null;
  };

  // Build entity
  const birthPlace = await parseBirthPlace();

  return {
    qid,
    label: entity.labels?.en?.value || '',
    description: entity.descriptions?.en?.value || null,
    isHuman,
    birthDate: parseDateClaim(PROPS.BIRTH_DATE),
    deathDate: parseDateClaim(PROPS.DEATH_DATE),
    birthPlace,
    occupations: await parseOccupations(),
    citizenship: await parseCitizenship(),
    imageFilename: getFirstClaimValue<string>(PROPS.IMAGE),
  };
}

/**
 * Fetch Wikipedia summary (extract + thumbnail)
 */
export async function fetchWikipediaSummary(slug: string): Promise<WikipediaSummary | null> {
  const url = `${WIKI_SUMMARY_API}${encodeURIComponent(slug)}`;
  const data = await fetchJson<{
    title?: string;
    extract?: string;
    description?: string;
    thumbnail?: { source?: string };
  }>(url);

  if (!data?.title) return null;

  return {
    title: data.title,
    extract: data.extract || '',
    description: data.description || null,
    thumbnailUrl: data.thumbnail?.source || null,
  };
}

/**
 * Normalize name for comparison
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate string similarity (0-1)
 */
function similarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);

  if (na === nb) return 1;

  // Levenshtein-based similarity
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;

  const matrix: number[][] = [];
  for (let i = 0; i <= nb.length; i++) matrix[i] = [i];
  for (let j = 0; j <= na.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= nb.length; i++) {
    for (let j = 1; j <= na.length; j++) {
      if (nb[i - 1] === na[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[nb.length][na.length];
  return 1 - distance / maxLen;
}

/**
 * Score confidence of a match
 */
export function scoreConfidence(
  searchQuery: string,
  wikiResult: WikiSearchResult,
  wikidataEntity: WikidataEntity | null
): { confidence: 'high' | 'medium' | 'low'; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // 1. Title similarity
  const titleSim = similarity(searchQuery, wikiResult.title);
  if (titleSim >= 0.95) {
    score += 40;
    reasons.push(`Exact title match (${(titleSim * 100).toFixed(0)}%)`);
  } else if (titleSim >= 0.8) {
    score += 25;
    reasons.push(`Close title match (${(titleSim * 100).toFixed(0)}%)`);
  } else if (titleSim >= 0.6) {
    score += 10;
    reasons.push(`Partial title match (${(titleSim * 100).toFixed(0)}%)`);
  }

  // 2. Is a human (very important!)
  if (wikidataEntity?.isHuman) {
    score += 30;
    reasons.push('Confirmed human');
  } else if (wikidataEntity) {
    score -= 20;
    reasons.push('Not a human entity');
  }

  // 3. Has biographical data
  if (wikidataEntity?.birthDate?.year) {
    score += 15;
    reasons.push(`Has birth year (${wikidataEntity.birthDate.year})`);
  }

  // 4. Has occupations
  if (wikidataEntity?.occupations && wikidataEntity.occupations.length > 0) {
    score += 10;
    reasons.push(`Has occupation(s): ${wikidataEntity.occupations.map(o => o.label).join(', ')}`);
  }

  // 5. Description contains historical keywords
  const historicalKeywords = [
    'politician', 'emperor', 'king', 'queen', 'philosopher', 'scientist',
    'artist', 'writer', 'composer', 'military', 'general', 'leader',
    'explorer', 'inventor', 'religious', 'theologian', 'revolutionary',
    'reformer', 'mathematician', 'physicist', 'historian', 'poet'
  ];

  const description = (wikidataEntity?.description || wikiResult.snippet || '').toLowerCase();
  const matchedKeywords = historicalKeywords.filter(kw => description.includes(kw));
  if (matchedKeywords.length > 0) {
    score += 5 * matchedKeywords.length;
    reasons.push(`Historical keywords: ${matchedKeywords.join(', ')}`);
  }

  // Determine confidence level
  let confidence: 'high' | 'medium' | 'low';
  if (score >= 70) {
    confidence = 'high';
  } else if (score >= 40) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return { confidence, reasons };
}

/**
 * Full enrichment: search Wikipedia, get Wikidata, return structured data
 */
export async function enrichFromWikipedia(
  displayName: string,
  normalizedName: string
): Promise<EnrichmentData | null> {
  // 1. Search Wikipedia
  const searchResults = await searchWikipedia(displayName);
  if (searchResults.length === 0) {
    // Try with normalized name if different
    if (normalizedName !== displayName.toLowerCase()) {
      const altResults = await searchWikipedia(normalizedName);
      if (altResults.length === 0) return null;
      searchResults.push(...altResults);
    } else {
      return null;
    }
  }

  // 2. Try top results until we find a good match
  for (const result of searchResults.slice(0, 3)) {
    // Get Wikidata QID
    const qid = await getWikidataQid(result.slug);
    if (!qid) continue;

    // Fetch Wikidata entity
    const entity = await fetchWikidataEntity(qid);
    if (!entity) continue;

    // Score confidence
    const { confidence, reasons } = scoreConfidence(displayName, result, entity);

    // Skip non-humans unless high title match
    if (!entity.isHuman && confidence !== 'high') continue;

    // Get Wikipedia summary for extract and thumbnail
    const summary = await fetchWikipediaSummary(result.slug);

    // Build enrichment data
    return {
      wikidataQid: qid,
      wikipediaSlug: result.slug,
      canonicalName: entity.label || result.title,
      birthYear: entity.birthDate?.year || null,
      deathYear: entity.deathDate?.year || null,
      birthPlace: entity.birthPlace?.label || null,
      birthLat: entity.birthPlace?.coords?.lat || null,
      birthLon: entity.birthPlace?.coords?.lon || null,
      occupation: entity.occupations[0]?.label || null,
      wikipediaExtract: summary?.extract || null,
      thumbnailUrl: summary?.thumbnailUrl || null,
      confidence,
      confidenceReasons: reasons,
    };
  }

  return null;
}

// Export for CommonJS compatibility
export default {
  searchWikipedia,
  getWikidataQid,
  fetchWikidataEntity,
  fetchWikipediaSummary,
  scoreConfidence,
  enrichFromWikipedia,
};
