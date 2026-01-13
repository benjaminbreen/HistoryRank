const WIKI_PAGEPROPS_API =
  'https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&format=json&titles=';
const WIKI_SUMMARY_API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const WIKI_PAGEVIEWS_API =
  'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/';
const WIKIDATA_ENTITY_API = 'https://www.wikidata.org/wiki/Special:EntityData/';

const entityCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSlug(slug) {
  return decodeURIComponent(slug || '').replace(/ /g, '_');
}

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'HistoryRank/1.0 (wikipedia helper)' },
  });
  if (res.status === 429 && attempt <= 5) {
    const retryAfter = Number(res.headers.get('retry-after') || 0);
    const delay = Math.max(1000, retryAfter * 1000, attempt * 1500);
    await sleep(delay);
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} for ${url}`);
  }
  return res.json();
}

async function getWikidataIdFromSlug(slug) {
  if (!slug) return null;
  const url = `${WIKI_PAGEPROPS_API}${encodeURIComponent(normalizeSlug(slug))}`;
  const data = await fetchJson(url);
  const pages = data?.query?.pages || {};
  const page = Object.values(pages)[0];
  return page?.pageprops?.wikibase_item || null;
}

async function getWikidataEntity(qid) {
  if (!qid) return null;
  if (entityCache.has(qid)) return entityCache.get(qid);
  const data = await fetchJson(`${WIKIDATA_ENTITY_API}${qid}.json`);
  const entity = data?.entities?.[qid] || null;
  entityCache.set(qid, entity);
  return entity;
}

function getLabel(entity) {
  return entity?.labels?.en?.value || null;
}

function getClaimValue(entity, prop) {
  const claims = entity?.claims?.[prop];
  if (!claims || !claims.length) return null;
  const snak = claims[0]?.mainsnak?.datavalue;
  return snak ? snak.value : null;
}

function getEntityId(entity, prop) {
  const value = getClaimValue(entity, prop);
  return value?.id || null;
}

function getCoordinates(entity) {
  const value = getClaimValue(entity, 'P625');
  if (!value || typeof value.latitude !== 'number' || typeof value.longitude !== 'number') {
    return null;
  }
  return { lat: value.latitude, lon: value.longitude };
}

async function fetchWikipediaSummary(slug) {
  if (!slug) return null;
  const url = `${WIKI_SUMMARY_API}${encodeURIComponent(slug)}`;
  return fetchJson(url);
}

async function fetchWikipediaPageviews(slug, startDate, endDate) {
  if (!slug) return null;
  const url = `${WIKI_PAGEVIEWS_API}${encodeURIComponent(slug)}/monthly/${startDate}/${endDate}`;
  const data = await fetchJson(url);
  if (data?.items && Array.isArray(data.items)) {
    return data.items.reduce((sum, item) => sum + (item.views || 0), 0);
  }
  return null;
}

module.exports = {
  fetchJson,
  normalizeSlug,
  getWikidataIdFromSlug,
  getWikidataEntity,
  getLabel,
  getClaimValue,
  getEntityId,
  getCoordinates,
  fetchWikipediaSummary,
  fetchWikipediaPageviews,
};
