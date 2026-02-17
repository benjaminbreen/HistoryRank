import Database from 'better-sqlite3';
import path from 'path';
import type { Metadata } from 'next';

const SITE_URL = 'https://historyrank.org';

type Props = {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
};

type FigureRow = {
  canonical_name: string;
  occupation: string | null;
  domain: string | null;
  era: string | null;
  birth_year: number | null;
  death_year: number | null;
  wikipedia_slug: string | null;
  llm_consensus_rank: number | null;
  region_sub: string | null;
};

function formatYearLabel(year: number | null): string {
  if (year === null) return '';
  if (year < 0) return `${Math.abs(year)} BCE`;
  return `${year}`;
}

function getFigure(id: string): FigureRow | undefined {
  try {
    const dbPath = path.join(process.cwd(), 'historyrank.db');
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare(
      'SELECT canonical_name, occupation, domain, era, birth_year, death_year, wikipedia_slug, llm_consensus_rank, region_sub FROM figures WHERE id = ?'
    ).get(id) as FigureRow | undefined;
    db.close();
    return row;
  } catch {
    return undefined;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const row = getFigure(id);

  if (!row) {
    return { title: 'Figure Not Found | HistoryRank' };
  }

  const birthLabel = row.birth_year
    ? row.birth_year < 0
      ? `${Math.abs(row.birth_year)} BCE`
      : `b. ${row.birth_year}`
    : '';

  const parts = [
    row.canonical_name,
    row.occupation,
    birthLabel ? `(${birthLabel})` : '',
  ].filter(Boolean);

  const rank = row.llm_consensus_rank ? `#${Math.round(row.llm_consensus_rank)}` : '';
  const description = `${parts.join(', ')} — ${rank ? `Ranked ${rank}. ` : ''}Rankings, AI assessments, and historical analysis on HistoryRank.`;

  return {
    title: `${row.canonical_name} | HistoryRank`,
    description,
    alternates: {
      canonical: `${SITE_URL}/figure/${id}`,
    },
    openGraph: {
      title: `${row.canonical_name} | HistoryRank`,
      description,
      url: `${SITE_URL}/figure/${id}`,
      siteName: 'HistoryRank',
      type: 'profile',
      images: [{
        url: `${SITE_URL}/api/og?id=${id}`,
        width: 1200,
        height: 630,
        alt: row.canonical_name,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${row.canonical_name} | HistoryRank`,
      description,
      images: [`${SITE_URL}/api/og?id=${id}`],
    },
  };
}

export default async function FigureLayout({ params, children }: Props) {
  const { id } = await params;
  const row = getFigure(id);

  if (!row) return <>{children}</>;

  const birthLabel = formatYearLabel(row.birth_year);
  const deathLabel = formatYearLabel(row.death_year);

  // Build JSON-LD Person schema
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: row.canonical_name,
    url: `${SITE_URL}/figure/${id}`,
  };

  if (row.occupation) jsonLd.jobTitle = row.occupation;
  if (row.domain) jsonLd.knowsAbout = row.domain;
  if (birthLabel) jsonLd.birthDate = birthLabel;
  if (deathLabel) jsonLd.deathDate = deathLabel;

  if (row.wikipedia_slug) {
    jsonLd.sameAs = `https://en.wikipedia.org/wiki/${row.wikipedia_slug}`;
  }

  // Add BreadcrumbList for Google
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'HistoryRank', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Rankings', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 3, name: row.canonical_name, item: `${SITE_URL}/figure/${id}` },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {children}
    </>
  );
}
