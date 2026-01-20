import { NextRequest, NextResponse } from 'next/server';
import { db, figures, rankings } from '@/lib/db';
import { asc, desc, like, eq, sql, and, isNotNull } from 'drizzle-orm';
import { getVarianceLevel } from '@/types';
import {
  toCSV,
  formatYear,
  generateMetadata,
  FIGURE_CSV_COLUMNS,
  VARIANCE_LEVEL_LABELS,
  type FigureExportRow,
} from '@/lib/export';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Parse query params
  const format = searchParams.get('format') || 'csv';
  const domain = searchParams.get('domain');
  const era = searchParams.get('era');
  const region = searchParams.get('region');
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  // Build query conditions
  const conditions = [];
  if (domain) conditions.push(eq(figures.domain, domain));
  if (era) conditions.push(eq(figures.era, era));
  if (region) conditions.push(eq(figures.regionSub, region));

  // Only include figures with LLM consensus rank
  conditions.push(isNotNull(figures.llmConsensusRank));

  try {
    // Query figures
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

    const rows = limit ? await query.limit(limit) : await query;

    // Get list of unique models
    const modelsResult = await db
      .selectDistinct({ source: rankings.source })
      .from(rankings);
    const models = modelsResult.map(r => r.source).sort();

    // Transform to export format
    const exportRows: FigureExportRow[] = rows.map((row, index) => {
      const varianceLevel = getVarianceLevel(row.varianceScore);
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
        llm_consensus_rank: row.llmConsensusRank?.toFixed(1) || '',
        hpi_rank: row.hpiRank?.toString() || '',
        variance_score: row.varianceScore?.toFixed(3) || '',
        variance_level: VARIANCE_LEVEL_LABELS[varianceLevel] || varianceLevel,
        pageviews_2025: row.pageviews2025?.toString() || '',
        pageviews_global: row.pageviewsGlobal?.toString() || '',
        badges: '', // TODO: Could compute badges but would slow down export significantly
        wikipedia_url: row.wikipediaSlug
          ? `https://en.wikipedia.org/wiki/${row.wikipediaSlug}`
          : '',
      };
    });

    // Generate metadata
    const metadata = generateMetadata(
      exportRows.length,
      { domain, era, region },
      models
    );

    if (format === 'json') {
      return NextResponse.json({
        meta: metadata,
        figures: exportRows,
      });
    }

    // Default: CSV
    const csv = toCSV(exportRows, FIGURE_CSV_COLUMNS);

    // Add metadata as comments at the top
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
