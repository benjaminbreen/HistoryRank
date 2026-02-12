import { NextRequest, NextResponse } from 'next/server';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  figureHistoricalSnippets,
  figureResearchSources,
  figureTimelineEvents,
  figures,
  influenceEdgeEvidence,
  influenceEdges,
} from '@/lib/db/schema';
import type { InfluenceEdgeDetailResponse } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseJsonSafe<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseEdgeId(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return parsed;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const edgeId = parseEdgeId(id);
  if (!edgeId) {
    return NextResponse.json({ error: 'Invalid edge id' }, { status: 400 });
  }

  try {
    const edgeRows = await db
      .select({
        id: influenceEdges.id,
        source: influenceEdges.fromFigureId,
        target: influenceEdges.toFigureId,
        direction: influenceEdges.direction,
        relationType: influenceEdges.relationType,
        confidence: influenceEdges.confidence,
        evidenceScore: influenceEdges.evidenceScore,
        supportCount: influenceEdges.supportCount,
        sourceFamilyCount: influenceEdges.sourceFamilyCount,
        status: influenceEdges.status,
      })
      .from(influenceEdges)
      .where(eq(influenceEdges.id, edgeId))
      .limit(1);

    const edge = edgeRows[0];
    if (!edge) {
      return NextResponse.json({ error: 'Edge not found' }, { status: 404 });
    }

    const figureRows = await db
      .select({
        id: figures.id,
        name: figures.canonicalName,
        wikipediaSlug: figures.wikipediaSlug,
      })
      .from(figures)
      .where(inArray(figures.id, [edge.source, edge.target]));

    const figureById = new Map(figureRows.map((row) => [row.id, row]));

    const evidenceRows = await db
      .select({
        id: influenceEdgeEvidence.id,
        evidenceKind: influenceEdgeEvidence.evidenceKind,
        sourceTable: influenceEdgeEvidence.sourceTable,
        sourceRowId: influenceEdgeEvidence.sourceRowId,
        excerpt: influenceEdgeEvidence.excerpt,
        weight: influenceEdgeEvidence.weight,
        metadata: influenceEdgeEvidence.metadata,
      })
      .from(influenceEdgeEvidence)
      .where(eq(influenceEdgeEvidence.edgeId, edgeId))
      .orderBy(desc(influenceEdgeEvidence.weight), desc(influenceEdgeEvidence.id));

    const timelineIds = evidenceRows
      .filter((row) => row.sourceTable === 'figure_timeline_events' && row.sourceRowId !== null)
      .map((row) => row.sourceRowId as number);
    const sourceIds = evidenceRows
      .filter((row) => row.sourceTable === 'figure_research_sources' && row.sourceRowId !== null)
      .map((row) => row.sourceRowId as number);
    const snippetIds = evidenceRows
      .filter((row) => row.sourceTable === 'figure_historical_snippets' && row.sourceRowId !== null)
      .map((row) => row.sourceRowId as number);

    const [timelineRows, sourceRows, snippetRows] = await Promise.all([
      timelineIds.length > 0
        ? db
            .select({
              id: figureTimelineEvents.id,
              figureId: figureTimelineEvents.figureId,
              eventLabel: figureTimelineEvents.eventLabel,
              eventDescription: figureTimelineEvents.eventDescription,
              metadata: figureTimelineEvents.metadata,
            })
            .from(figureTimelineEvents)
            .where(inArray(figureTimelineEvents.id, timelineIds))
        : Promise.resolve([]),
      sourceIds.length > 0
        ? db
            .select({
              id: figureResearchSources.id,
              figureId: figureResearchSources.figureId,
              title: figureResearchSources.title,
              sourceUrl: figureResearchSources.sourceUrl,
              accessUrl: figureResearchSources.accessUrl,
            })
            .from(figureResearchSources)
            .where(inArray(figureResearchSources.id, sourceIds))
        : Promise.resolve([]),
      snippetIds.length > 0
        ? db
            .select({
              id: figureHistoricalSnippets.id,
              figureId: figureHistoricalSnippets.figureId,
              corpus: figureHistoricalSnippets.corpus,
              sourceTitle: figureHistoricalSnippets.sourceTitle,
              sourceUrl: figureHistoricalSnippets.sourceUrl,
            })
            .from(figureHistoricalSnippets)
            .where(inArray(figureHistoricalSnippets.id, snippetIds))
        : Promise.resolve([]),
    ]);

    const timelineById = new Map(timelineRows.map((row) => [row.id, row]));
    const sourceById = new Map(sourceRows.map((row) => [row.id, row]));
    const snippetById = new Map(snippetRows.map((row) => [row.id, row]));

    const sourceFigureIds = new Set<string>();
    for (const row of timelineRows) sourceFigureIds.add(row.figureId);
    for (const row of sourceRows) sourceFigureIds.add(row.figureId);
    for (const row of snippetRows) sourceFigureIds.add(row.figureId);
    for (const row of evidenceRows) {
      const metadata = parseJsonSafe<Record<string, unknown>>(row.metadata, {});
      const generatedFrom = asString(metadata.generated_from);
      if (generatedFrom) sourceFigureIds.add(generatedFrom);
      const figureId = asString(metadata.figure_id);
      if (figureId) sourceFigureIds.add(figureId);
    }

    if (sourceFigureIds.size > 0) {
      const extraFigureRows = await db
        .select({
          id: figures.id,
          name: figures.canonicalName,
          wikipediaSlug: figures.wikipediaSlug,
        })
        .from(figures)
        .where(inArray(figures.id, Array.from(sourceFigureIds)));
      for (const row of extraFigureRows) {
        figureById.set(row.id, row);
      }
    }

    const response: InfluenceEdgeDetailResponse = {
      edge: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceName: figureById.get(edge.source)?.name || edge.source,
        targetName: figureById.get(edge.target)?.name || edge.target,
        direction: (edge.direction === 'directed' ? 'directed' : 'undirected') as 'directed' | 'undirected',
        relationType: edge.relationType as 'influenced' | 'mentored' | 'rival' | 'associated',
        confidence: edge.confidence,
        evidenceScore: edge.evidenceScore,
        supportCount: edge.supportCount,
        sourceFamilyCount: edge.sourceFamilyCount,
        status: (edge.status === 'approved' ? 'approved' : 'candidate') as 'approved' | 'candidate',
      },
      evidence: evidenceRows.map((row) => {
        const metadata = parseJsonSafe<Record<string, unknown>>(row.metadata, {});
        let sourceTitle: string | null = null;
        let sourceUrl: string | null = asString(metadata.source_url);
        let sourceFigureId: string | null = asString(metadata.figure_id);

        if (row.sourceTable === 'figure_timeline_events' && row.sourceRowId !== null) {
          const ctx = timelineById.get(row.sourceRowId);
          if (ctx) {
            sourceTitle = `Timeline event: ${ctx.eventLabel}`;
            sourceFigureId = ctx.figureId;
            const eventMeta = parseJsonSafe<Record<string, unknown>>(ctx.metadata, {});
            sourceUrl = sourceUrl || asString(eventMeta.source_url);
          }
        } else if (row.sourceTable === 'figure_research_sources' && row.sourceRowId !== null) {
          const ctx = sourceById.get(row.sourceRowId);
          if (ctx) {
            sourceTitle = ctx.title;
            sourceFigureId = ctx.figureId;
            sourceUrl = sourceUrl || ctx.sourceUrl || ctx.accessUrl;
          }
        } else if (row.sourceTable === 'figure_historical_snippets' && row.sourceRowId !== null) {
          const ctx = snippetById.get(row.sourceRowId);
          if (ctx) {
            sourceTitle = ctx.sourceTitle || `Historical snippet (${ctx.corpus})`;
            sourceFigureId = ctx.figureId;
            sourceUrl = sourceUrl || ctx.sourceUrl;
          }
        } else if (row.sourceTable === 'figures') {
          sourceFigureId = sourceFigureId || asString(metadata.generated_from);
          if (!sourceTitle) {
            sourceTitle = asString(metadata.inference)
              ? 'Chronology inference'
              : 'LLM related-figure seed';
          }
        }

        if (!sourceTitle) {
          sourceTitle = asString(metadata.source_title);
        }

        let sourceFigureName: string | null = null;
        if (sourceFigureId) {
          sourceFigureName = figureById.get(sourceFigureId)?.name || sourceFigureId;
          if (!sourceUrl) {
            const slug = figureById.get(sourceFigureId)?.wikipediaSlug;
            if (slug) sourceUrl = `https://en.wikipedia.org/wiki/${slug}`;
          }
        }

        return {
          id: row.id,
          evidenceKind: row.evidenceKind as 'timeline_ref' | 'source_excerpt' | 'snippet_match' | 'llm_seed',
          sourceTable: row.sourceTable as
            | 'figure_timeline_events'
            | 'figure_research_sources'
            | 'figure_historical_snippets'
            | 'figures',
          sourceRowId: row.sourceRowId,
          excerpt: row.excerpt,
          weight: row.weight,
          metadata,
          sourceTitle,
          sourceUrl,
          sourceFigureId,
          sourceFigureName,
        };
      }),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Error fetching influence edge detail:', err.message, err.stack);
    return NextResponse.json(
      { error: 'Failed to fetch influence edge detail', detail: err.message },
      { status: 500 }
    );
  }
}
