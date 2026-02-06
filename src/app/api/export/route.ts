import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { db, figures, rankings } from '@/lib/db';
import { asc, eq, and, isNotNull } from 'drizzle-orm';
import { getVarianceLevel } from '@/types';
import {
  toCSV,
  formatYear,
  generateMetadata,
  FIGURE_CSV_COLUMNS,
  VARIANCE_LEVEL_LABELS,
  RANKING_CSV_COLUMNS,
  type FigureExportRow,
  type RankingExportRow,
} from '@/lib/export';

export const runtime = 'nodejs';

const V2_CACHE_TTL = 5 * 60 * 1000;
let v2RankCache: Map<string, number> | null = null;
let v2OrderedIdsCache: string[] | null = null;
let v2CacheTimestamp = 0;
let v3RankCache: Map<string, number> | null = null;
let v3OrderedIdsCache: string[] | null = null;
let v3CacheTimestamp = 0;

function getV2RankLookup() {
  const now = Date.now();
  if (v2RankCache && v2OrderedIdsCache && now - v2CacheTimestamp < V2_CACHE_TTL) {
    return { rankLookup: v2RankCache, orderedIds: v2OrderedIdsCache };
  }

  const v2Path = path.join(process.cwd(), 'data', 'derived', 'v2-consensus.json');
  if (!fs.existsSync(v2Path)) {
    return null;
  }

  const payload = JSON.parse(fs.readFileSync(v2Path, 'utf8')) as {
    figures: { id: string; avg_rank: number }[];
  };

  const lookup = new Map<string, number>();
  const orderedIds = payload.figures
    .sort((a, b) => a.avg_rank - b.avg_rank)
    .map(entry => {
      lookup.set(entry.id, entry.avg_rank);
      return entry.id;
    });

  v2RankCache = lookup;
  v2OrderedIdsCache = orderedIds;
  v2CacheTimestamp = now;

  return { rankLookup: lookup, orderedIds };
}

function getV3RankLookup() {
  const now = Date.now();
  if (v3RankCache && v3OrderedIdsCache && now - v3CacheTimestamp < V2_CACHE_TTL) {
    return { rankLookup: v3RankCache, orderedIds: v3OrderedIdsCache };
  }

  const v3Path = path.join(process.cwd(), 'data', 'derived', 'v3-consensus.json');
  if (!fs.existsSync(v3Path)) {
    return null;
  }

  const payload = JSON.parse(fs.readFileSync(v3Path, 'utf8')) as {
    figures: { id: string; avgRank: number }[];
  };

  const lookup = new Map<string, number>();
  const orderedIds = payload.figures
    .sort((a, b) => a.avgRank - b.avgRank)
    .map(entry => {
      lookup.set(entry.id, entry.avgRank);
      return entry.id;
    });

  v3RankCache = lookup;
  v3OrderedIdsCache = orderedIds;
  v3CacheTimestamp = now;

  return { rankLookup: lookup, orderedIds };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = (searchParams.get('type') || 'figures').toLowerCase();

  if (type === 'rankings') {
    const format = searchParams.get('format') || 'csv';
    const model = searchParams.get('model');
    const includeContribution = searchParams.get('include_contribution') === 'true';
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    try {
      const conditions = [];
      if (model) conditions.push(eq(rankings.source, model));

      let query = db
        .select({
          figureId: rankings.figureId,
          figureName: figures.canonicalName,
          source: rankings.source,
          rank: rankings.rank,
          contribution: rankings.contribution,
        })
        .from(rankings)
        .innerJoin(figures, eq(rankings.figureId, figures.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(rankings.source), asc(rankings.rank));

      const rows = limit ? await query.limit(limit) : await query;

      const modelsInExport = [...new Set(rows.map(r => r.source))].sort();

      const exportRows: RankingExportRow[] = rows.map(row => ({
        figure_id: row.figureId,
        figure_name: row.figureName,
        model: row.source,
        rank: row.rank,
        contribution: includeContribution ? (row.contribution || '') : '',
      }));

      const metadata = generateMetadata(
        exportRows.length,
        { model, include_contribution: includeContribution ? 'true' : 'false' },
        modelsInExport
      );

      if (format === 'json') {
        return NextResponse.json({
          meta: metadata,
          rankings: exportRows,
        });
      }

      const columns = includeContribution
        ? RANKING_CSV_COLUMNS
        : RANKING_CSV_COLUMNS.filter(c => c.key !== 'contribution');

      const csv = toCSV(exportRows, columns);

      const csvHeader = [
        `# HistoryRank Export - Raw Rankings`,
        `# Exported: ${metadata.exported_at}`,
        `# Total Records: ${metadata.total_records}`,
        `# Filters: ${JSON.stringify(metadata.filters_applied)}`,
        `# Models: ${metadata.models_included.join(', ')}`,
        `# Citation: ${metadata.citation}`,
        `# Documentation: ${metadata.documentation_url}`,
        `#`,
        `# Note: Each row is one ranking from one model for one figure.`,
        `# Use this data for inter-rater reliability analysis and model comparisons.`,
        `#`,
      ].join('\n');

      const fullCsv = csvHeader + '\n' + csv;

      const filename = model
        ? `historyrank-rankings-${model.replace(/[^a-z0-9]/gi, '-')}-${new Date().toISOString().split('T')[0]}.csv`
        : `historyrank-rankings-all-${new Date().toISOString().split('T')[0]}.csv`;

      return new NextResponse(fullCsv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    } catch (error) {
      console.error('Export error:', error);
      return NextResponse.json(
        { error: 'Failed to export data' },
        { status: 500 }
      );
    }
  }

  const format = searchParams.get('format') || 'csv';
  const domain = searchParams.get('domain');
  const era = searchParams.get('era');
  const region = searchParams.get('region');
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;
  const useV2 = searchParams.get('v2') === 'true';
  const useV3 = searchParams.get('v3') === 'true';

  const conditions = [];
  if (domain) conditions.push(eq(figures.domain, domain));
  if (era) conditions.push(eq(figures.era, era));
  if (region) conditions.push(eq(figures.regionSub, region));

  if (!useV2 && !useV3) {
    conditions.push(isNotNull(figures.llmConsensusRank));
  }

  try {
    const v2Data = useV2 ? getV2RankLookup() : null;
    const v3Data = useV3 ? getV3RankLookup() : null;
    if ((useV2 && !v2Data) || (useV3 && !v3Data)) {
      return NextResponse.json(
        { error: useV3 ? 'V3 consensus data not found. Run scripts/build-v3-consensus.ts first.' : 'V2 consensus data not found. Run scripts/build-v2-consensus.ts first.' },
        { status: 400 }
      );
    }

    let query = db
      .select({
        id: figures.id,
        canonicalName: figures.canonicalName,
        birthYear: figures.birthYear,
        deathYear: figures.deathYear,
        domain: figures.domain,
        occupation: figures.occupation,
        era: figures.era,
        regionSub: figures.regionSub,
        llmConsensusRank: figures.llmConsensusRank,
        hpiRank: figures.hpiRank,
        varianceScore: figures.varianceScore,
        pageviews2025: figures.pageviews2025,
        pageviewsGlobal: figures.pageviewsGlobal,
        wikipediaSlug: figures.wikipediaSlug,
      })
      .from(figures)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(figures.llmConsensusRank));

    const rows = (useV2 || !limit) ? await query : await query.limit(limit);

    const filteredRows = (useV3 && v3Data)
      ? rows.filter(row => v3Data.rankLookup.has(row.id))
      : useV2 && v2Data
        ? rows.filter(row => v2Data.rankLookup.has(row.id))
        : rows;

    const sortedRows = useV3 && v3Data
      ? filteredRows.sort((a, b) => (v3Data.rankLookup.get(a.id) || 0) - (v3Data.rankLookup.get(b.id) || 0))
      : useV2 && v2Data
        ? filteredRows.sort((a, b) => (v2Data.rankLookup.get(a.id) || 0) - (v2Data.rankLookup.get(b.id) || 0))
        : filteredRows;

    const displayRank = useV3 && v3Data
      ? new Map(v3Data.orderedIds.map((id, idx) => [id, idx + 1]))
      : useV2 && v2Data
        ? new Map(v2Data.orderedIds.map((id, idx) => [id, idx + 1]))
        : null;

    const limitedRows = limit ? sortedRows.slice(0, limit) : sortedRows;

    const models = useV3
      ? ['v3-consensus']
      : useV2
        ? ['v2-consensus']
        : (await db.selectDistinct({ source: rankings.source }).from(rankings)).map(r => r.source).sort();

    const exportRows: FigureExportRow[] = limitedRows.map((row, index) => {
      const varianceLevel = getVarianceLevel(row.varianceScore);
      const v2Rank = useV2 && v2Data ? v2Data.rankLookup.get(row.id) : null;
      const v3Rank = useV3 && v3Data ? v3Data.rankLookup.get(row.id) : null;
      return {
        rank: index + 1,
        id: row.id,
        name: row.canonicalName,
        birth_year: formatYear(row.birthYear),
        death_year: formatYear(row.deathYear),
        domain: row.domain || '',
        occupation: row.occupation || '',
        era: row.era || '',
        region: row.regionSub || '',
        llm_consensus_rank: useV3
          ? String(displayRank?.get(row.id) || '')
          : useV2
            ? String(displayRank?.get(row.id) || '')
            : (row.llmConsensusRank?.toFixed(1) || ''),
        hpi_rank: row.hpiRank?.toString() || '',
        variance_score: row.varianceScore?.toFixed(3) || '',
        variance_level: VARIANCE_LEVEL_LABELS[varianceLevel] || varianceLevel,
        pageviews_2025: row.pageviews2025?.toString() || '',
        pageviews_global: row.pageviewsGlobal?.toString() || '',
        badges: '',
        wikipedia_url: row.wikipediaSlug
          ? `https://en.wikipedia.org/wiki/${row.wikipediaSlug}`
          : '',
      };
    });

    const metadata = generateMetadata(
      exportRows.length,
      {
        domain,
        era,
        region,
        limit: limit !== undefined ? String(limit) : null,
        v2: useV2 ? 'true' : null,
        v3: useV3 ? 'true' : null,
      },
      models
    );

    if (format === 'json') {
      return NextResponse.json({
        meta: metadata,
        figures: exportRows,
      });
    }

    const csv = toCSV(exportRows, FIGURE_CSV_COLUMNS);
    const csvHeader = [
      `# HistoryRank Export - Figures`,
      `# Exported: ${metadata.exported_at}`,
      `# Total Records: ${metadata.total_records}`,
      `# Filters: ${JSON.stringify(metadata.filters_applied)}`,
      `# Models: ${metadata.models_included.join(', ')}`,
      `# Citation: ${metadata.citation}`,
      `# Documentation: ${metadata.documentation_url}`,
      `#`,
    ].join('\n');

    const fullCsv = csvHeader + '\n' + csv;
    const filename = `historyrank-figures-${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(fullCsv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    );
  }
}
