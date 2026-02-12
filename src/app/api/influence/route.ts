import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { figures, influenceEdges } from '@/lib/db/schema';
import type { InfluenceNetworkResponse } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 120;

const MAX_TOP = 1000;

function parseTop(value: string | null): number {
  const parsed = Number.parseInt(value || '1000', 10);
  if (!Number.isFinite(parsed)) return 1000;
  return Math.max(20, Math.min(MAX_TOP, parsed));
}

function parseMinConfidence(value: string | null): number {
  const parsed = Number.parseFloat(value || '0');
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

function parseStatus(value: string | null): 'all' | 'approved' | 'candidate' {
  if (value === 'approved' || value === 'candidate') return value;
  return 'all';
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const top = parseTop(params.get('top'));
  const minConfidence = parseMinConfidence(params.get('minConfidence'));
  const statusFilter = parseStatus(params.get('status'));

  try {
    const topRows = await db
      .select({
        id: figures.id,
        name: figures.canonicalName,
        llmRank: figures.llmConsensusRank,
        birthYear: figures.birthYear,
        deathYear: figures.deathYear,
        domain: figures.domain,
      })
      .from(figures)
      .where(isNotNull(figures.llmConsensusRank))
      .orderBy(asc(figures.llmConsensusRank))
      .limit(top);

    if (topRows.length === 0) {
      const empty: InfluenceNetworkResponse = {
        nodes: [],
        edges: [],
        stats: {
          figureWindow: top,
          connectedNodes: 0,
          edgeCount: 0,
          approvedCount: 0,
          candidateCount: 0,
        },
      };
      return NextResponse.json(empty);
    }

    const topIds = topRows.map((row) => row.id);
    const figureById = new Map(topRows.map((row) => [row.id, row]));

    const conditions = [
      inArray(influenceEdges.fromFigureId, topIds),
      inArray(influenceEdges.toFigureId, topIds),
      gte(influenceEdges.confidence, minConfidence),
    ];
    if (statusFilter !== 'all') {
      conditions.push(eq(influenceEdges.status, statusFilter));
    }

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
      .where(and(...conditions))
      .orderBy(desc(influenceEdges.confidence), desc(influenceEdges.evidenceScore), asc(influenceEdges.id));

    const degreeByFigure = new Map<string, number>();
    const nodeHasApprovedEdge = new Map<string, boolean>();
    for (const edge of edgeRows) {
      degreeByFigure.set(edge.source, (degreeByFigure.get(edge.source) || 0) + 1);
      degreeByFigure.set(edge.target, (degreeByFigure.get(edge.target) || 0) + 1);
      if (edge.status === 'approved') {
        nodeHasApprovedEdge.set(edge.source, true);
        nodeHasApprovedEdge.set(edge.target, true);
      }
    }

    const nodes = Array.from(degreeByFigure.keys())
      .map((figureId) => {
        const figure = figureById.get(figureId);
        if (!figure) return null;
        return {
          id: figure.id,
          name: figure.name,
          llmRank: figure.llmRank,
          birthYear: figure.birthYear,
          deathYear: figure.deathYear,
          domain: figure.domain,
          status: (nodeHasApprovedEdge.get(figureId) ? 'approved' : 'candidate') as 'approved' | 'candidate',
          degree: degreeByFigure.get(figureId) || 0,
        };
      })
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
      .sort((a, b) => b.degree - a.degree || (a.llmRank ?? 9999) - (b.llmRank ?? 9999));

    const response: InfluenceNetworkResponse = {
      nodes,
      edges: edgeRows.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        direction: (edge.direction === 'directed' ? 'directed' : 'undirected') as 'directed' | 'undirected',
        relationType: (edge.relationType as 'influenced' | 'mentored' | 'rival' | 'associated'),
        confidence: edge.confidence,
        evidenceScore: edge.evidenceScore,
        supportCount: edge.supportCount,
        sourceFamilyCount: edge.sourceFamilyCount,
        status: (edge.status === 'approved' ? 'approved' : 'candidate') as 'approved' | 'candidate',
      })),
      stats: {
        figureWindow: top,
        connectedNodes: nodes.length,
        edgeCount: edgeRows.length,
        approvedCount: edgeRows.filter((edge) => edge.status === 'approved').length,
        candidateCount: edgeRows.filter((edge) => edge.status === 'candidate').length,
      },
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Error fetching influence network:', err.message, err.stack);
    return NextResponse.json(
      { error: 'Failed to fetch influence network', detail: err.message },
      { status: 500 }
    );
  }
}
