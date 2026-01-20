import { NextResponse } from 'next/server';
import { loadMediaItems } from '@/lib/media';

type Provider = {
  id: number;
  name: string;
  logoPath: string | null;
  type: string;
  url: string | null;
};

const PROVIDER_URL_TEMPLATES: Record<number, (title: string) => string> = {
  8: (t) => `https://www.netflix.com/search?q=${encodeURIComponent(t)}`, // Netflix
  9: (t) => `https://www.amazon.com/s?k=${encodeURIComponent(t)}&i=instant-video`, // Amazon Prime
  10: (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`, // Apple TV
  15: (t) => `https://www.hulu.com/search?q=${encodeURIComponent(t)}`, // Hulu
  337: (t) => `https://www.disneyplus.com/search?q=${encodeURIComponent(t)}`, // Disney+
  1899: (t) => `https://www.max.com/search?q=${encodeURIComponent(t)}`, // Max (HBO)
  386: (t) => `https://www.peacocktv.com/search?q=${encodeURIComponent(t)}`, // Peacock
  531: (t) => `https://www.paramountplus.com/search/?q=${encodeURIComponent(t)}`, // Paramount+
  350: (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`, // Apple TV+
  387: (t) => `https://www.peacocktv.com/search?q=${encodeURIComponent(t)}`, // Peacock Premium
  526: (t) => `https://www.amazon.com/s?k=${encodeURIComponent(t)}&i=instant-video`, // AMC+
  1770: (t) => `https://www.paramountplus.com/search/?q=${encodeURIComponent(t)}`, // Paramount+ with Showtime
  2: (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`, // Apple iTunes
  3: (t) => `https://play.google.com/store/search?q=${encodeURIComponent(t)}&c=movies`, // Google Play
  192: (t) => `https://www.youtube.com/results?search_query=${encodeURIComponent(t)}+full+movie`, // YouTube
  7: (t) => `https://vudu.com/content/movies/search?searchString=${encodeURIComponent(t)}`, // Vudu
};

function pickType(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes('tv') || normalized.includes('series') || normalized.includes('miniseries')) {
    return 'tv';
  }
  return 'movie';
}

function selectProviders(entry: any, title: string) {
  if (!entry) return [];
  const buckets = ['flatrate', 'free', 'ads', 'buy', 'rent'];
  const seen = new Set<number>();
  const providers: Provider[] = [];
  for (const bucket of buckets) {
    const list = Array.isArray(entry[bucket]) ? entry[bucket] : [];
    for (const item of list) {
      if (!item?.provider_id || seen.has(item.provider_id)) continue;
      seen.add(item.provider_id);
      const urlTemplate = PROVIDER_URL_TEMPLATES[item.provider_id];
      providers.push({
        id: item.provider_id,
        name: item.provider_name ?? 'Unknown',
        logoPath: item.logo_path ?? null,
        type: bucket,
        url: urlTemplate ? urlTemplate(title) : null,
      });
    }
  }
  return providers;
}

async function fetchJson(url: string) {
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`TMDb request failed (${res.status})`);
  return res.json();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mediaId = searchParams.get('mediaId');
  const region = searchParams.get('region') || 'US';
  const apiKey = process.env.TMDB_API_KEY;

  if (!mediaId) {
    return NextResponse.json({ providers: [] });
  }
  if (!apiKey) {
    return NextResponse.json({ providers: [], error: 'TMDB_API_KEY not set' }, { status: 500 });
  }

  const items = loadMediaItems();
  const item = items.find((entry) => entry.id === mediaId);
  if (!item) {
    return NextResponse.json({ providers: [] }, { status: 404 });
  }

  const type = pickType(item.type);
  const query = encodeURIComponent(item.title);
  const yearParam = item.release_year
    ? type === 'tv'
      ? `&first_air_date_year=${item.release_year}`
      : `&year=${item.release_year}`
    : '';

  const searchUrl = `https://api.themoviedb.org/3/search/${type}?api_key=${apiKey}&query=${query}${yearParam}`;
  const searchData = await fetchJson(searchUrl);
  const result = Array.isArray(searchData?.results) ? searchData.results[0] : null;
  if (!result?.id) {
    return NextResponse.json({ providers: [], tmdbId: null });
  }

  const providersUrl = `https://api.themoviedb.org/3/${type}/${result.id}/watch/providers?api_key=${apiKey}`;
  const providersData = await fetchJson(providersUrl);
  const entry = providersData?.results?.[region] || providersData?.results?.US || null;
  const providers = selectProviders(entry, item.title);

  return NextResponse.json({
    tmdbId: result.id,
    link: entry?.link ?? null,
    providers,
  });
}
