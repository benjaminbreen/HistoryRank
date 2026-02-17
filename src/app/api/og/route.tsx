import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

export const runtime = 'nodejs';

const DOMAIN_COLORS: Record<string, string> = {
  'Science': '#3b82f6',
  'Religion': '#8b5cf6',
  'Philosophy': '#6366f1',
  'Politics': '#ef4444',
  'Law': '#f87171',
  'Military': '#f97316',
  'Arts': '#10b981',
  'Exploration': '#06b6d4',
  'Economics': '#f59e0b',
  'Medicine': '#ec4899',
  'Social Reform': '#14b8a6',
  'Society': '#22c55e',
};

type FigureRow = {
  canonical_name: string;
  occupation: string | null;
  domain: string | null;
  era: string | null;
  birth_year: number | null;
  death_year: number | null;
  llm_consensus_rank: number | null;
};

function getFigure(id: string): FigureRow | undefined {
  try {
    const dbPath = path.join(process.cwd(), 'historyrank.db');
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare(
      'SELECT canonical_name, occupation, domain, era, birth_year, death_year, llm_consensus_rank FROM figures WHERE id = ?'
    ).get(id) as FigureRow | undefined;
    db.close();
    return row;
  } catch {
    return undefined;
  }
}

function formatYear(year: number | null): string {
  if (year === null) return '';
  if (year < 0) return `${Math.abs(year)} BCE`;
  return `${year}`;
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');

  if (!id) {
    return new Response('Missing id parameter', { status: 400 });
  }

  const figure = getFigure(id);

  if (!figure) {
    return new Response('Figure not found', { status: 404 });
  }

  const domainColor = (figure.domain && DOMAIN_COLORS[figure.domain]) || '#6b7280';
  const rank = figure.llm_consensus_rank ? Math.round(figure.llm_consensus_rank) : null;
  const birthLabel = formatYear(figure.birth_year);
  const deathLabel = formatYear(figure.death_year);

  let lifespan = '';
  if (birthLabel && deathLabel) {
    lifespan = `${birthLabel} – ${deathLabel}`;
  } else if (birthLabel) {
    lifespan = `b. ${birthLabel}`;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Domain color accent bar at top */}
        <div
          style={{
            width: '100%',
            height: '6px',
            backgroundColor: domainColor,
            display: 'flex',
          }}
        />

        {/* Main content area */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '48px 60px 40px',
            flex: 1,
          }}
        >
          {/* Top row: Domain + Era badges */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            {figure.domain && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: domainColor + '30',
                  border: `1px solid ${domainColor}80`,
                  borderRadius: '20px',
                  padding: '6px 18px',
                  fontSize: '22px',
                  color: domainColor,
                  fontWeight: 600,
                }}
              >
                {figure.domain}
              </div>
            )}
            {figure.era && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '20px',
                  padding: '6px 18px',
                  fontSize: '22px',
                  color: '#94a3b8',
                }}
              >
                {figure.era}
              </div>
            )}
          </div>

          {/* Figure name */}
          <div
            style={{
              fontSize: figure.canonical_name.length > 25 ? '64px' : '76px',
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              marginBottom: '16px',
              display: 'flex',
            }}
          >
            {figure.canonical_name}
          </div>

          {/* Subtitle: occupation + lifespan */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              fontSize: '28px',
              color: '#94a3b8',
              marginBottom: '12px',
            }}
          >
            {figure.occupation && (
              <span style={{ display: 'flex' }}>{figure.occupation}</span>
            )}
            {figure.occupation && lifespan && (
              <span style={{ display: 'flex', color: '#475569' }}>·</span>
            )}
            {lifespan && (
              <span style={{ display: 'flex' }}>{lifespan}</span>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '24px 60px',
            backgroundColor: '#1e293b',
            borderTop: '1px solid #334155',
          }}
        >
          {/* Rank badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {rank !== null && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '32px',
                  fontWeight: 700,
                }}
              >
                <span style={{ color: domainColor, display: 'flex' }}>#{rank}</span>
                <span style={{ color: '#64748b', fontSize: '22px', display: 'flex' }}>
                  of 4,606
                </span>
              </div>
            )}
          </div>

          {/* Site name */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '26px',
              fontWeight: 600,
              color: '#94a3b8',
            }}
          >
            <span style={{ display: 'flex' }}>HistoryRank</span>
            <span style={{ color: '#475569', fontSize: '22px', display: 'flex' }}>
              historyrank.org
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
