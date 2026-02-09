import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  figures,
  figureResearchSources,
  figureQuotes,
  figureHistoricalSnippets,
  figureAssessments,
  figureTimelineEvents,
} from '@/lib/db';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { FigureEvidenceResponse } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_CURATION_STATUSES = ['auto', 'reviewed', 'approved'] as const;
const ACTIVE_ASSESSMENT_STATUSES = ['draft', 'published'] as const;

function parseJsonSafe<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function dedupeNumbers(values: number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value)))).sort((a, b) => a - b);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const figure = await db.query.figures.findFirst({
      where: eq(figures.id, id),
      columns: { id: true, canonicalName: true },
    });

    if (!figure) {
      return NextResponse.json({ error: 'Figure not found' }, { status: 404 });
    }

    const [sources, quotes, snippets, assessments, allEvents] = await Promise.all([
      db
        .select()
        .from(figureResearchSources)
        .where(
          and(
            eq(figureResearchSources.figureId, id),
            inArray(figureResearchSources.curationStatus, ACTIVE_CURATION_STATUSES)
          )
        )
        .orderBy(desc(figureResearchSources.confidence), asc(figureResearchSources.title))
        .limit(30),
      db
        .select()
        .from(figureQuotes)
        .where(
          and(
            eq(figureQuotes.figureId, id),
            inArray(figureQuotes.curationStatus, ACTIVE_CURATION_STATUSES)
          )
        )
        .orderBy(desc(figureQuotes.confidence), asc(figureQuotes.id))
        .limit(12),
      db
        .select()
        .from(figureHistoricalSnippets)
        .where(
          and(
            eq(figureHistoricalSnippets.figureId, id),
            inArray(figureHistoricalSnippets.curationStatus, ACTIVE_CURATION_STATUSES)
          )
        )
        .orderBy(desc(figureHistoricalSnippets.matchScore), desc(figureHistoricalSnippets.editionYear))
        .limit(12),
      db
        .select()
        .from(figureAssessments)
        .where(
          and(
            eq(figureAssessments.figureId, id),
            inArray(figureAssessments.status, ACTIVE_ASSESSMENT_STATUSES)
          )
        )
        .orderBy(desc(figureAssessments.generatedAt))
        .limit(10),
      db
        .select()
        .from(figureTimelineEvents)
        .where(eq(figureTimelineEvents.figureId, id))
        .orderBy(asc(figureTimelineEvents.sortIndex), asc(figureTimelineEvents.eventStartYear))
        .limit(100),
    ]);

    const timelineAssessment =
      assessments.find((row) => row.assessmentKind === 'timeline_events' && row.status === 'published') ||
      assessments.find((row) => row.assessmentKind === 'timeline_events') ||
      assessments.find((row) => row.assessmentKind === 'importance_summary' && row.status === 'published') ||
      assessments.find((row) => row.assessmentKind === 'importance_summary') ||
      null;
    const timelineAssessmentJson = timelineAssessment
      ? parseJsonSafe<Record<string, unknown>>(timelineAssessment.assessmentJson, {})
      : null;
    const timelineEvidenceIndex = Array.isArray(timelineAssessmentJson?.evidence_index)
      ? (timelineAssessmentJson.evidence_index as Array<Record<string, unknown>>)
      : [];
    const legacyRefToSourceId = new Map<number, number>();
    for (const item of timelineEvidenceIndex) {
      const refId = typeof item.refId === 'number' ? item.refId : null;
      const tableId = typeof item.tableId === 'number' ? item.tableId : null;
      if (refId === null || tableId === null) continue;
      if (item.kind === 'source') {
        legacyRefToSourceId.set(refId, tableId);
      }
    }

    const events = timelineAssessment
      ? allEvents.filter((row) => row.assessmentId === timelineAssessment.id)
      : allEvents.filter((row) => row.assessmentId === null);

    const response: FigureEvidenceResponse = {
      figureId: figure.id,
      figureName: figure.canonicalName,
      research: {
        sources: sources.map((row) => ({
          id: row.id,
          sourceRole: row.sourceRole,
          sourceCorpus: row.sourceCorpus,
          sourceKind: row.sourceKind,
          title: row.title,
          author: row.author,
          publicationYear: row.publicationYear,
          sourceUrl: row.sourceUrl,
          accessUrl: row.accessUrl,
          snippet: row.snippet,
          isPublicDomain: row.isPublicDomain,
          confidence: row.confidence,
          curationStatus: row.curationStatus,
          metadata: parseJsonSafe<Record<string, unknown>>(row.metadata, {}),
        })),
        quotes: quotes.map((row) => ({
          id: row.id,
          sourceId: row.sourceId,
          quoteText: row.quoteText,
          attributedTo: row.attributedTo,
          quoteYear: row.quoteYear,
          sourceUrl: row.sourceUrl,
          verificationStatus: row.verificationStatus,
          warningShort: row.warningShort,
          confidence: row.confidence,
          curationStatus: row.curationStatus,
          metadata: parseJsonSafe<Record<string, unknown>>(row.metadata, {}),
        })),
        historicalSnippets: snippets.map((row) => ({
          id: row.id,
          corpus: row.corpus,
          editionYear: row.editionYear,
          sourceTitle: row.sourceTitle,
          sourceUrl: row.sourceUrl,
          snippet: row.snippet,
          matchScore: row.matchScore,
          curationStatus: row.curationStatus,
          metadata: parseJsonSafe<Record<string, unknown>>(row.metadata, {}),
        })),
      },
      timeline: {
        assessment: timelineAssessment
          ? {
              id: timelineAssessment.id,
              assessmentKind: timelineAssessment.assessmentKind,
              model: timelineAssessment.model,
              promptVersion: timelineAssessment.promptVersion,
              triggerMode: timelineAssessment.triggerMode,
              assessmentText: timelineAssessment.assessmentText,
              assessmentJson: timelineAssessmentJson || {},
              citations: parseJsonSafe<number[]>(timelineAssessment.citations, []),
              status: timelineAssessment.status,
              generatedAt: toIso(timelineAssessment.generatedAt),
            }
          : null,
        events: events.map((row) => ({
          id: row.id,
          assessmentId: row.assessmentId,
          eventLabel: row.eventLabel,
          eventDescription: row.eventDescription,
          eventStartYear: row.eventStartYear,
          eventEndYear: row.eventEndYear,
          placeLabel: row.placeLabel,
          placeLat: row.placeLat,
          placeLon: row.placeLon,
          confidence: row.confidence,
          sourceIds: dedupeNumbers(
            parseJsonSafe<number[]>(row.sourceIds, []).map((id) => legacyRefToSourceId.get(id) ?? id)
          ),
          sortIndex: row.sortIndex,
          metadata: parseJsonSafe<Record<string, unknown>>(row.metadata, {}),
        })),
      },
      meta: {
        sourceCount: sources.length,
        quoteCount: quotes.length,
        snippetCount: snippets.length,
        eventCount: events.length,
        hasAnyEvidence: sources.length > 0 || quotes.length > 0 || snippets.length > 0 || events.length > 0,
      },
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Error fetching figure evidence:', err.message, err.stack);
    return NextResponse.json(
      { error: 'Failed to fetch figure evidence', detail: err.message },
      { status: 500 }
    );
  }
}
