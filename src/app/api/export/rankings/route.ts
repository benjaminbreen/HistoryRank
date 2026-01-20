import { NextRequest, NextResponse } from 'next/server';
import { db, figures, rankings } from '@/lib/db';
import { asc, eq, and } from 'drizzle-orm';
import {
  toCSV,
  generateMetadata,
  RANKING_CSV_COLUMNS,
  type RankingExportRow,
} from '@/lib/export';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Parse query params
  const format = searchParams.get('format') || 'csv';
  const model = searchParams.get('model');
  const includeContribution = searchParams.get('include_contribution') === 'true';
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  try {
    // Build query conditions
    const conditions = [];
    if (model) conditions.push(eq(rankings.source, model));

    // Query rankings with figure names
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

    // Get list of unique models in export
    const modelsInExport = [...new Set(rows.map(r => r.source))].sort();

    // Transform to export format
    const exportRows: RankingExportRow[] = rows.map(row => ({
      figure_id: row.figureId,
      figure_name: row.figureName,
      model: row.source,
      rank: row.rank,
      contribution: includeContribution ? (row.contribution || '') : '',
    }));

    // Generate metadata
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

    // Default: CSV
    // If not including contribution, filter out that column
    const columns = includeContribution
      ? RANKING_CSV_COLUMNS
      : RANKING_CSV_COLUMNS.filter(c => c.key !== 'contribution');

    const csv = toCSV(exportRows, columns);

    // Add metadata as comments at the top
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
