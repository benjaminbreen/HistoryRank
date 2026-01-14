'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { FigureDetailPanel } from '@/components/detail/FigureDetailPanel';
import { AgreementHeatmap } from '@/components/compare/AgreementHeatmap';
import { ModelProfileCard } from '@/components/compare/ModelProfileCard';
import { ControversyCard } from '@/components/compare/ControversyCard';
import { DomainBreakdown } from '@/components/compare/DomainBreakdown';
import { PairwiseScatter } from '@/components/compare/PairwiseScatter';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { useSearchParams } from 'next/navigation';
import { Tooltip } from '@/components/ui/tooltip';
import { ListPreviewDialog } from '@/components/compare/ListPreviewDialog';
import type { Figure, Ranking, FigureDetailResponse } from '@/types';
import type { LLMComparisonResponse } from '@/app/api/llm-comparison/route';

type ViewMode = 'overview' | 'domain' | 'era' | 'pairwise' | 'lists';

type ListEntry = {
  file: string;
  label: string;
  size: number;
  downloadUrl: string;
};

function CompareLoading() {
  return (
    <main className="min-h-screen bg-transparent">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="space-y-8">
          <Skeleton className="h-64 w-full rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-80 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    </main>
  );
}

function CompareContent() {
  const [data, setData] = useState<LLMComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [showAllControversial, setShowAllControversial] = useState(false);
  const [listData, setListData] = useState<ListEntry[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [activeList, setActiveList] = useState<ListEntry | null>(null);
  const [listOpen, setListOpen] = useState(false);

  // Pairwise comparison state
  const [selectedModel1, setSelectedModel1] = useState<string | null>(null);
  const [selectedModel2, setSelectedModel2] = useState<string | null>(null);

  // Detail panel state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFigure, setSelectedFigure] = useState<Figure | null>(null);
  const [selectedRankings, setSelectedRankings] = useState<Ranking[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const { settings, updateSettings, resetSettings } = useSettings();
  const searchParams = useSearchParams();

  useEffect(() => {
    const view = searchParams.get('view') as ViewMode | null;
    if (view && ['overview', 'domain', 'era', 'pairwise', 'lists'].includes(view)) {
      setViewMode(view);
    }
  }, [searchParams]);

  // Fetch comparison data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetch('/api/llm-comparison');
        if (!res.ok) {
          setErrorMessage(`Failed to fetch comparison data (${res.status}).`);
          return;
        }
        const result: LLMComparisonResponse = await res.json();
        setData(result);

        // Set default pairwise models
        if (result.models.length >= 2) {
          setSelectedModel1(result.models[0].source);
          setSelectedModel2(result.models[1].source);
        }
      } catch (error) {
        console.error('Failed to fetch comparison data:', error);
        setErrorMessage('Failed to fetch comparison data.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Fetch figure details when selected
  useEffect(() => {
    if (!selectedId) {
      setSelectedFigure(null);
      setSelectedRankings([]);
      return;
    }

    const fetchDetail = async () => {
      setIsDetailLoading(true);
      try {
        const res = await fetch(`/api/figures/${selectedId}`);
        if (!res.ok) {
          setSelectedFigure(null);
          setSelectedRankings([]);
          return;
        }
        const data: FigureDetailResponse = await res.json();
        setSelectedFigure(data?.figure ?? null);
        setSelectedRankings(Array.isArray(data?.rankings) ? data.rankings : []);
      } catch (error) {
        console.error('Failed to fetch figure detail:', error);
      } finally {
        setIsDetailLoading(false);
      }
    };

    fetchDetail();
  }, [selectedId]);

  // Handle heatmap cell click
  const handleHeatmapClick = (source1: string, source2: string) => {
    if (source1 !== source2) {
      setSelectedModel1(source1);
      setSelectedModel2(source2);
      setViewMode('pairwise');
    }
  };

  const controversialToShow = showAllControversial
    ? data?.controversialFigures
    : data?.controversialFigures?.slice(0, 5);

  const listsByModel = useMemo(() => {
    const map = new Map<string, ListEntry[]>();
    for (const entry of listData) {
      const label = entry.label || 'Other';
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(entry);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [listData]);

  const fetchLists = async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch('/api/lists');
      if (!res.ok) {
        setListError(`Failed to fetch list index (${res.status}).`);
        return;
      }
      const payload = await res.json();
      setListData(Array.isArray(payload?.lists) ? payload.lists : []);
    } catch (error) {
      console.error('Failed to fetch list index:', error);
      setListError('Failed to fetch list index.');
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode !== 'lists' || listData.length > 0 || listLoading) return;
    fetchLists();
  }, [viewMode, listData.length, listLoading]);

  return (
    <main className="min-h-screen bg-transparent">
      <AppHeader
        active="compare"
        settings={settings}
        onSettingsChange={updateSettings}
        onSettingsReset={resetSettings}
      />

      {/* Main content */}
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {errorMessage && (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <CompareLoading />
        ) : data ? (
          <>
            {/* View mode tabs */}
            <div className="flex flex-wrap gap-2 mb-8">
              <button
                onClick={() => setViewMode('overview')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'overview'
                    ? 'bg-stone-900 dark:bg-amber-900/50 text-white dark:text-amber-100'
                    : 'bg-white dark:bg-slate-800 text-stone-600 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700 border border-stone-200 dark:border-slate-700'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setViewMode('domain')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'domain'
                    ? 'bg-stone-900 dark:bg-amber-900/50 text-white dark:text-amber-100'
                    : 'bg-white dark:bg-slate-800 text-stone-600 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700 border border-stone-200 dark:border-slate-700'
                }`}
              >
                By Domain
              </button>
              <button
                onClick={() => setViewMode('era')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'era'
                    ? 'bg-stone-900 dark:bg-amber-900/50 text-white dark:text-amber-100'
                    : 'bg-white dark:bg-slate-800 text-stone-600 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700 border border-stone-200 dark:border-slate-700'
                }`}
              >
                By Era
              </button>
              <button
                onClick={() => setViewMode('pairwise')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'pairwise'
                    ? 'bg-stone-900 dark:bg-amber-900/50 text-white dark:text-amber-100'
                    : 'bg-white dark:bg-slate-800 text-stone-600 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700 border border-stone-200 dark:border-slate-700'
                }`}
              >
                Pairwise Compare
              </button>
              <button
                onClick={() => setViewMode('lists')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'lists'
                    ? 'bg-stone-900 dark:bg-amber-900/50 text-white dark:text-amber-100'
                    : 'bg-white dark:bg-slate-800 text-stone-600 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700 border border-stone-200 dark:border-slate-700'
                }`}
              >
                All Lists
              </button>
            </div>

            {viewMode === 'overview' && (
              <div className="space-y-8">
                {/* Agreement Heatmap */}
                <section className="bg-white dark:bg-slate-800 rounded-2xl border border-stone-200 dark:border-slate-700 p-7">
                  <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100">
                          Model Agreement
                        </h2>
                        <Tooltip
                          content="Each cell compares two models. Higher correlation means the models rank figures more similarly."
                          align="left"
                        >
                          <HelpCircle className="w-4 h-4 text-stone-400 cursor-help" />
                        </Tooltip>
                      </div>
                      <p className="text-sm text-stone-500 dark:text-slate-400">
                        This heatmap shows how closely pairs of models align across the full list. Click any cell
                        to open a direct, side-by-side comparison.
                      </p>

                      <div className="mt-5 rounded-xl border border-stone-200/70 bg-stone-50/60 p-4 text-xs text-stone-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">
                          Agreement levels
                        </div>
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500 dark:bg-emerald-600" />
                            <span>85%+ (very high agreement)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400 dark:bg-emerald-500" />
                            <span>80–84% (high agreement)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-sm bg-lime-400 dark:bg-lime-500" />
                            <span>70–79% (moderate agreement)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-sm bg-amber-400 dark:bg-amber-500" />
                            <span>62–69% (mixed agreement)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-sm bg-orange-400 dark:bg-orange-500" />
                            <span>55–61% (low agreement)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-sm bg-rose-400 dark:bg-rose-500" />
                            <span>48–54% (very low agreement)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-sm bg-red-400 dark:bg-red-500" />
                            <span>&lt;48% (divergent)</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <AgreementHeatmap
                        correlations={data.correlationMatrix}
                        models={data.models}
                        onCellClick={handleHeatmapClick}
                      />
                    </div>
                  </div>
                </section>

                {/* Model Profile Cards */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100">
                      Model Profiles
                    </h2>
                    <Tooltip
                      content="Each card shows a model's 'personality': which domains it favors, its top-ranked figure, and its biggest outlier compared to consensus."
                      align="left"
                    >
                      <HelpCircle className="w-4 h-4 text-stone-400 cursor-help" />
                    </Tooltip>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {data.models.map((model) => (
                      <ModelProfileCard
                        key={model.source}
                        model={model}
                        totalModels={data.models.length}
                        onFigureClick={setSelectedId}
                      />
                    ))}
                  </div>
                </section>

                {/* Most Controversial Figures */}
                <section className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100">
                      Most Debated Figures
                    </h2>
                    <Tooltip
                      content="These figures show the highest disagreement between models. The variance score indicates how much the models differ in their rankings."
                      align="left"
                    >
                      <HelpCircle className="w-4 h-4 text-stone-400 cursor-help" />
                    </Tooltip>
                  </div>
                  <p className="text-sm text-stone-500 dark:text-slate-400 mb-6">
                    These historical figures show the highest disagreement between models
                  </p>
                  <div className="space-y-3">
                    {controversialToShow?.map((figure, index) => (
                      <ControversyCard
                        key={figure.id}
                        figure={figure}
                        rank={index + 1}
                        onClick={() => setSelectedId(figure.id)}
                      />
                    ))}
                  </div>
                  {data.controversialFigures.length > 5 && (
                    <button
                      onClick={() => setShowAllControversial(!showAllControversial)}
                      className="mt-4 w-full py-2 text-sm text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200 flex items-center justify-center gap-1"
                    >
                      {showAllControversial ? (
                        <>
                          Show less <ChevronUp className="w-4 h-4" />
                        </>
                      ) : (
                        <>
                          Show {data.controversialFigures.length - 5} more <ChevronDown className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  )}
                </section>
              </div>
            )}

            {viewMode === 'domain' && (
              <DomainBreakdown
                data={data.domainBreakdown}
                models={data.models}
                title="Rankings by Domain"
                description="Average rank each model gives to figures in each domain (lower = model ranks that domain more highly)"
              />
            )}

            {viewMode === 'era' && (
              <DomainBreakdown
                data={data.eraBreakdown}
                models={data.models}
                title="Rankings by Era"
                description="Average rank each model gives to figures from each era (lower = model ranks that era more highly)"
              />
            )}

            {viewMode === 'pairwise' && (
              <PairwiseScatter
                models={data.models}
                correlations={data.correlationMatrix}
                selectedModel1={selectedModel1}
                selectedModel2={selectedModel2}
                onModel1Change={setSelectedModel1}
                onModel2Change={setSelectedModel2}
                onFigureClick={setSelectedId}
              />
            )}

            {viewMode === 'lists' && (
              <section className="bg-white dark:bg-slate-800 rounded-2xl border border-stone-200 dark:border-slate-700 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100">All raw lists</h2>
                    <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                      Download the full JSON outputs used to build the consensus rankings. Grouped by model.
                    </p>
                  </div>
                  <button
                    onClick={fetchLists}
                    className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-stone-300 hover:text-stone-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-amber-600/60 dark:hover:text-amber-100"
                  >
                    Refresh
                  </button>
                </div>

                {listLoading ? (
                  <div className="mt-6 space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-xl" />
                    ))}
                  </div>
                ) : listError ? (
                  <div className="mt-6 text-sm text-stone-500">{listError}</div>
                ) : (
                  <div className="mt-6 grid gap-6 lg:grid-cols-2">
                    {listsByModel.map(([model, entries]) => (
                      <details
                        key={model}
                        className="group rounded-2xl border border-stone-200/70 bg-stone-50/60 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-stone-800 dark:text-amber-100">
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">
                              Model
                            </div>
                            <div className="text-base font-semibold">{model}</div>
                          </div>
                          <div className="text-xs text-stone-500 dark:text-slate-400">
                            {entries.length} list{entries.length !== 1 ? 's' : ''}
                          </div>
                        </summary>
                        <div className="mt-4 space-y-2 text-sm">
                          {entries.map((entry) => (
                            <button
                              key={entry.file}
                              onClick={() => {
                                setActiveList(entry);
                                setListOpen(true);
                              }}
                              className="flex w-full items-center justify-between rounded-xl border border-stone-200/70 bg-white/80 px-3 py-2 text-left text-stone-600 transition-all hover:-translate-y-0.5 hover:border-stone-300 hover:text-stone-900 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-amber-600/60 dark:hover:text-amber-100"
                            >
                              <span className="truncate">{entry.file}</span>
                              <span className="text-xs text-stone-400 dark:text-slate-500">
                                {(entry.size / 1024).toFixed(1)} KB
                              </span>
                            </button>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        ) : null}
      </div>

      <ListPreviewDialog
        open={listOpen}
        onOpenChange={setListOpen}
        entry={activeList}
      />

      {/* Detail Panel */}
      <FigureDetailPanel
        figure={selectedFigure}
        rankings={selectedRankings}
        isOpen={selectedId !== null}
        onClose={() => setSelectedId(null)}
        isLoading={isDetailLoading}
      />
    </main>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<CompareLoading />}>
      <CompareContent />
    </Suspense>
  );
}
