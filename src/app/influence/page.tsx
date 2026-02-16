'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/AppHeader';
import { InfluenceGraph } from '@/components/influence/InfluenceGraph';
import { InfluenceChronoDag } from '@/components/influence/InfluenceChronoDag';
import { Skeleton } from '@/components/ui/skeleton';
import { useSettings } from '@/hooks/useSettings';
import type { InfluenceEdgeDetailResponse, InfluenceNetworkResponse } from '@/types';

type StatusFilter = 'all' | 'approved' | 'candidate';
type InfluenceViewMode = 'tree' | 'network';

export default function InfluencePage() {
  const { settings, updateSettings, resetSettings } = useSettings();

  const [top, setTop] = useState(1000);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [minConfidence, setMinConfidence] = useState(0.3);
  const [viewMode, setViewMode] = useState<InfluenceViewMode>('tree');
  const [showUndirectedTreeLinks, setShowUndirectedTreeLinks] = useState(true);
  const [data, setData] = useState<InfluenceNetworkResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<number | null>(null);
  const [selectedEdgeDetail, setSelectedEdgeDetail] = useState<InfluenceEdgeDetailResponse | null>(null);
  const [selectedEdgeLoading, setSelectedEdgeLoading] = useState(false);
  const [selectedEdgeError, setSelectedEdgeError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const params = new URLSearchParams({
          top: String(top),
          status,
          minConfidence: String(minConfidence),
        });
        const res = await fetch(`/api/influence?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) {
          setData(null);
          setErrorMessage(`Failed to fetch influence network (${res.status}).`);
          return;
        }
        const payload = (await res.json()) as InfluenceNetworkResponse;
        setData(payload);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        console.error('Failed to fetch influence network:', error);
        setData(null);
        setErrorMessage('Failed to fetch influence network.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    return () => controller.abort();
  }, [top, status, minConfidence]);

  const topEdges = useMemo(() => {
    if (!data) return [];
    return [...data.edges].sort((a, b) => b.confidence - a.confidence).slice(0, 14);
  }, [data]);

  const directedCount = useMemo(
    () => data?.edges.filter((edge) => edge.direction === 'directed').length ?? 0,
    [data?.edges]
  );
  const undirectedCount = useMemo(
    () => data?.edges.filter((edge) => edge.direction === 'undirected').length ?? 0,
    [data?.edges]
  );

  const nodeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of data?.nodes || []) {
      map.set(node.id, node.name);
    }
    return map;
  }, [data?.nodes]);

  const selectedEdge = useMemo(() => {
    if (!data || selectedEdgeId === null) return null;
    return data.edges.find((edge) => edge.id === selectedEdgeId) || null;
  }, [data, selectedEdgeId]);

  const isEvidenceOpen = selectedEdgeId !== null;

  useEffect(() => {
    if (!selectedEdgeId) return;
    const existsInView = data?.edges.some((edge) => edge.id === selectedEdgeId) ?? false;
    if (!existsInView) {
      setSelectedEdgeId(null);
      setSelectedEdgeDetail(null);
      setSelectedEdgeError(null);
      setSelectedEdgeLoading(false);
    }
  }, [data?.edges, selectedEdgeId]);

  useEffect(() => {
    if (selectedEdgeId === null) {
      setSelectedEdgeDetail(null);
      setSelectedEdgeLoading(false);
      setSelectedEdgeError(null);
      return;
    }

    const controller = new AbortController();
    const fetchEdgeDetail = async () => {
      setSelectedEdgeLoading(true);
      setSelectedEdgeError(null);
      try {
        const res = await fetch(`/api/influence/edges/${selectedEdgeId}`, { signal: controller.signal });
        if (!res.ok) {
          setSelectedEdgeDetail(null);
          setSelectedEdgeError(`Failed to load edge evidence (${res.status}).`);
          return;
        }
        const payload = (await res.json()) as InfluenceEdgeDetailResponse;
        setSelectedEdgeDetail(payload);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        console.error('Failed to fetch influence edge detail:', error);
        setSelectedEdgeDetail(null);
        setSelectedEdgeError('Failed to load edge evidence.');
      } finally {
        setSelectedEdgeLoading(false);
      }
    };

    fetchEdgeDetail();
    return () => controller.abort();
  }, [selectedEdgeId]);

  useEffect(() => {
    if (!isEvidenceOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedEdgeId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isEvidenceOpen]);

  const selectEdge = (edgeId: number) => {
    setSelectedEdgeId((prev) => (prev === edgeId ? null : edgeId));
  };

  return (
    <main className="min-h-screen bg-[#f8f5ef] dark:bg-slate-900">
      <AppHeader
        active="influence"
        settings={settings}
        onSettingsChange={updateSettings}
        onSettingsReset={resetSettings}
      />

      <div className="mx-auto max-w-7xl px-6 pb-16 pt-10 space-y-6">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-400 dark:text-slate-500">Visualize</p>
          <h1 className="text-3xl font-serif text-stone-900 dark:text-amber-100">Chronological Influence Tree (PoC)</h1>
          <p className="max-w-3xl text-sm text-stone-600 dark:text-slate-400">
            Timeline-first DAG view of figure-to-figure influence links. Directed edges flow top-to-bottom through time.
            The network mode remains available for cluster inspection.
          </p>
        </header>

        <section className="rounded-2xl border border-stone-200/70 dark:border-slate-700 bg-white/85 dark:bg-slate-800/80 p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-stone-500 dark:text-slate-400">
              Top window
              <select
                value={top}
                onChange={(e) => setTop(Number.parseInt(e.target.value, 10))}
                className="ml-2 rounded-full border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1 text-sm text-stone-700 dark:text-slate-200"
              >
                <option value={100}>Top 100</option>
                <option value={200}>Top 200</option>
                <option value={300}>Top 300</option>
                <option value={400}>Top 400</option>
                <option value={500}>Top 500</option>
                <option value={600}>Top 600</option>
                <option value={700}>Top 700</option>
                <option value={800}>Top 800</option>
                <option value={900}>Top 900</option>
                <option value={1000}>Top 1000</option>
              </select>
            </label>

            <label className="text-xs text-stone-500 dark:text-slate-400">
              View
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as InfluenceViewMode)}
                className="ml-2 rounded-full border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1 text-sm text-stone-700 dark:text-slate-200"
              >
                <option value="tree">Chronological tree</option>
                <option value="network">Force network</option>
              </select>
            </label>

            <label className="text-xs text-stone-500 dark:text-slate-400">
              Edge status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
                className="ml-2 rounded-full border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1 text-sm text-stone-700 dark:text-slate-200"
              >
                <option value="all">All</option>
                <option value="approved">Approved only</option>
                <option value="candidate">Candidate only</option>
              </select>
            </label>

            <label className="text-xs text-stone-500 dark:text-slate-400">
              Min confidence
              <span className="ml-2 font-mono text-stone-700 dark:text-slate-200">{minConfidence.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={0.95}
              step={0.01}
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number.parseFloat(e.target.value))}
              className="w-44 accent-amber-600"
            />

            {viewMode === 'tree' && (
              <label className="ml-auto inline-flex items-center gap-2 text-xs text-stone-500 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={showUndirectedTreeLinks}
                  onChange={(e) => setShowUndirectedTreeLinks(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-stone-300 accent-amber-600"
                />
                Show undirected cross-links
              </label>
            )}
          </div>
        </section>

        {isLoading ? (
          <section className="space-y-4">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-[620px] w-full rounded-2xl" />
          </section>
        ) : errorMessage ? (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
            {errorMessage}
          </section>
        ) : data ? (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <StatCard label="Top Window" value={String(data.stats.figureWindow)} />
              <StatCard label="Connected Nodes" value={String(data.stats.connectedNodes)} />
              <StatCard label="Edges" value={String(data.stats.edgeCount)} />
              <StatCard label="Directed" value={String(directedCount)} />
              <StatCard label="Undirected" value={String(undirectedCount)} />
            </section>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-2">
              <StatCard label="Approved" value={String(data.stats.approvedCount)} />
              <StatCard label="Candidate" value={String(data.stats.candidateCount)} />
            </section>

            {data.edges.length === 0 ? (
              <section className="rounded-xl border border-stone-200/70 dark:border-slate-700 bg-white/85 dark:bg-slate-800/80 p-5 text-sm text-stone-600 dark:text-slate-400">
                No edges matched these filters yet.
              </section>
            ) : (
              <section className="space-y-2">
                <div>
                  {viewMode === 'tree' ? (
                    <InfluenceChronoDag
                      nodes={data.nodes}
                      edges={data.edges}
                      showUndirectedLinks={showUndirectedTreeLinks}
                      onEdgeSelect={selectEdge}
                      selectedEdgeId={selectedEdgeId}
                    />
                  ) : (
                    <InfluenceGraph
                      nodes={data.nodes}
                      edges={data.edges}
                      onEdgeSelect={selectEdge}
                      selectedEdgeId={selectedEdgeId}
                    />
                  )}
                  {viewMode === 'tree' && (
                    <p className="text-xs text-stone-500 dark:text-slate-400 mt-2">
                      Tree mode prioritizes directed influence edges and chronological layering by birth year. Wheel to zoom;
                      drag background to pan. Click an edge to open evidence.
                    </p>
                  )}
                </div>
              </section>
            )}

            {topEdges.length > 0 && (
              <section className="rounded-2xl border border-stone-200/70 dark:border-slate-700 bg-white/85 dark:bg-slate-800/80 p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-stone-800 dark:text-slate-100 mb-3">Top edges in current view</h2>
                <div className="space-y-2">
                  {topEdges.map((edge) => {
                    const sourceName = nodeNameById.get(edge.source) || edge.source;
                    const targetName = nodeNameById.get(edge.target) || edge.target;
                    const selected = edge.id === selectedEdgeId;
                    return (
                      <div
                        key={edge.id}
                        className={`rounded-lg border px-3 py-2 text-xs cursor-pointer transition-colors ${
                          selected
                            ? 'border-amber-500/60 bg-amber-50/60 dark:border-amber-400/70 dark:bg-amber-950/20'
                            : 'border-stone-200/70 dark:border-slate-700'
                        }`}
                        onClick={() => selectEdge(edge.id)}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/figure/${edge.source}`}
                            className="font-medium text-stone-800 dark:text-slate-100 hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {sourceName}
                          </Link>
                          <span className="text-stone-400 dark:text-slate-500">
                            {edge.direction === 'directed' ? '→' : '↔'}
                          </span>
                          <Link
                            href={`/figure/${edge.target}`}
                            className="font-medium text-stone-800 dark:text-slate-100 hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {targetName}
                          </Link>
                          <span className="ml-auto font-mono text-stone-500 dark:text-slate-400">
                            conf {edge.confidence.toFixed(3)}
                          </span>
                        </div>
                        <div className="mt-1 text-stone-500 dark:text-slate-400">
                          {edge.status} · {edge.relationType} · evidence {edge.supportCount} items / {edge.sourceFamilyCount} families
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        ) : null}
      </div>

      {isEvidenceOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close edge evidence panel"
            onClick={() => setSelectedEdgeId(null)}
            className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
          />

          <aside className="absolute right-0 top-0 h-full w-[min(460px,92vw)] border-l border-stone-200/70 dark:border-slate-700 bg-white/96 dark:bg-slate-900/96 shadow-2xl p-4 md:p-5 flex flex-col animate-in slide-in-from-right duration-200">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-stone-200/70 dark:border-slate-700">
              <div>
                <h2 className="text-sm font-semibold text-stone-800 dark:text-slate-100">Edge evidence</h2>
                <p className="mt-1 text-xs text-stone-500 dark:text-slate-400">
                  Supporting excerpts and source context for the selected edge.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEdgeId(null)}
                className="rounded-md border border-stone-300 dark:border-slate-600 px-2 py-1 text-xs text-stone-700 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto pr-1">
              {selectedEdgeLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-5 w-2/3 rounded" />
                  <Skeleton className="h-12 w-full rounded" />
                  <Skeleton className="h-20 w-full rounded" />
                </div>
              ) : selectedEdgeError ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                  {selectedEdgeError}
                </div>
              ) : selectedEdgeDetail ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-stone-200/70 dark:border-slate-700 p-3">
                    <div className="flex items-center gap-2 text-sm text-stone-800 dark:text-slate-100">
                      <Link href={`/figure/${selectedEdgeDetail.edge.source}`} className="font-medium hover:underline">
                        {selectedEdgeDetail.edge.sourceName}
                      </Link>
                      <span className="text-stone-400 dark:text-slate-500">
                        {selectedEdgeDetail.edge.direction === 'directed' ? '→' : '↔'}
                      </span>
                      <Link href={`/figure/${selectedEdgeDetail.edge.target}`} className="font-medium hover:underline">
                        {selectedEdgeDetail.edge.targetName}
                      </Link>
                    </div>
                    <div className="mt-1 text-[11px] text-stone-500 dark:text-slate-400">
                      {selectedEdgeDetail.edge.status} · {selectedEdgeDetail.edge.relationType} · conf{' '}
                      {selectedEdgeDetail.edge.confidence.toFixed(3)} · evidence {selectedEdgeDetail.edge.supportCount}/
                      {selectedEdgeDetail.edge.sourceFamilyCount}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {selectedEdgeDetail.evidence.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-stone-200/70 dark:border-slate-700 px-3 py-2 text-xs"
                      >
                        <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-stone-500 dark:text-slate-400">
                          {item.evidenceKind} · w {item.weight.toFixed(2)}
                        </div>
                        {item.excerpt ? (
                          <p className="mt-1 text-stone-700 dark:text-slate-200 leading-relaxed">{item.excerpt}</p>
                        ) : (
                          <p className="mt-1 text-stone-500 dark:text-slate-400 italic">No excerpt captured.</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-stone-500 dark:text-slate-400">
                          {item.sourceFigureId && (
                            <Link href={`/figure/${item.sourceFigureId}`} className="hover:underline">
                              {item.sourceFigureName || item.sourceFigureId}
                            </Link>
                          )}
                          {item.sourceTitle && <span>{item.sourceTitle}</span>}
                          {item.sourceUrl && (
                            <a
                              href={item.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-amber-700 dark:text-amber-300 hover:underline"
                            >
                              source
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                    {selectedEdgeDetail.evidence.length === 0 && (
                      <div className="rounded-lg border border-dashed border-stone-300 dark:border-slate-600 p-3 text-xs text-stone-500 dark:text-slate-400">
                        No evidence rows found for this edge.
                      </div>
                    )}
                  </div>
                </div>
              ) : selectedEdge ? (
                <div className="rounded-lg border border-stone-200/70 dark:border-slate-700 p-3 text-xs text-stone-600 dark:text-slate-400">
                  Selected edge: {nodeNameById.get(selectedEdge.source) || selectedEdge.source}{' '}
                  {selectedEdge.direction === 'directed' ? '→' : '↔'}{' '}
                  {nodeNameById.get(selectedEdge.target) || selectedEdge.target}
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200/70 dark:border-slate-700 bg-white/85 dark:bg-slate-800/80 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.12em] text-stone-400 dark:text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-stone-800 dark:text-slate-100">{value}</div>
    </div>
  );
}
