import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const BADGE_SLUGS: Record<string, string> = {
  hiddengems: 'hidden-gem',
  'hidden-gem': 'hidden-gem',
  undertheradar: 'under-the-radar',
  'under-the-radar': 'under-the-radar',
  globalicon: 'global-icon',
  'global-icon': 'global-icon',
  universalrecognition: 'universal-recognition',
  'universal-recognition': 'universal-recognition',
  popular: 'popular',
  llmfavorite: 'llm-favorite',
  'llm-favorite': 'llm-favorite',
  legacyleaning: 'legacy-leaning',
  'legacy-leaning': 'legacy-leaning',
};

const RESERVED_ROUTES = new Set([
  'about',
  'methodology',
  'caveats',
  'maps',
  'scatter',
  'compare',
  'api',
]);

const ERAS = [
  'Ancient',
  'Classical',
  'Late Antiquity',
  'Medieval',
  'Early Modern',
  'Industrial',
  'Modern',
  'Contemporary',
];

const REGIONS = [
  'Northern Europe',
  'Western Europe',
  'Southern Europe',
  'Eastern Europe',
  'North Africa',
  'West Africa',
  'East Africa',
  'Central Africa',
  'Southern Africa',
  'Western Asia',
  'Central Asia',
  'South Asia',
  'East Asia',
  'Southeast Asia',
  'North America',
  'Central America',
  'South America',
  'Oceania',
];

const DOMAINS = [
  'Science',
  'Religion',
  'Philosophy',
  'Politics',
  'Military',
  'Arts',
  'Exploration',
  'Economics',
  'Medicine',
  'Social Reform',
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildLookup(values: string[]): Map<string, string> {
  return new Map(values.map((value) => [slugify(value), value]));
}

const ERA_LOOKUP = buildLookup(ERAS);
const REGION_LOOKUP = buildLookup(REGIONS);
const DOMAIN_LOOKUP = buildLookup(DOMAINS);

function applyFilterFromSegment(url: URL, segment: string) {
  if (ERA_LOOKUP.has(segment)) {
    url.searchParams.set('era', ERA_LOOKUP.get(segment) as string);
    return;
  }
  if (REGION_LOOKUP.has(segment)) {
    url.searchParams.set('region', REGION_LOOKUP.get(segment) as string);
    return;
  }
  if (DOMAIN_LOOKUP.has(segment)) {
    url.searchParams.set('domain', DOMAIN_LOOKUP.get(segment) as string);
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return NextResponse.next();
  }

  const [first, second, ...rest] = segments;

  if (RESERVED_ROUTES.has(first) || first.startsWith('_')) {
    return NextResponse.next();
  }

  if (first === 'figure' && second) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('figure', second);
    return NextResponse.rewrite(url);
  }

  const badge = BADGE_SLUGS[first];
  if (badge) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('badge', badge);
    for (const segment of [second, ...rest].filter(Boolean)) {
      applyFilterFromSegment(url, segment);
    }
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)'],
};
