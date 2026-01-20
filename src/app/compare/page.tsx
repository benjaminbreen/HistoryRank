'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useQueryState, parseAsStringLiteral } from 'nuqs';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import { AppHeader } from '@/components/layout/AppHeader';
import { FigureDetailPanel } from '@/components/detail/FigureDetailPanel';
import { AgreementHeatmap } from '@/components/compare/AgreementHeatmap';
import { ModelProfileCard } from '@/components/compare/ModelProfileCard';
import { ControversyCard } from '@/components/compare/ControversyCard';
import { DomainBreakdown } from '@/components/compare/DomainBreakdown';
import { OutlierSpotlight } from '@/components/compare/OutlierSpotlight';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { Tooltip } from '@/components/ui/tooltip';
import { ListPreviewDialog } from '@/components/compare/ListPreviewDialog';
import { InsightsPanel } from '@/components/compare/InsightsPanel';
import { fetcher, comparisonDataConfig, figureDetailConfig, listDataConfig } from '@/lib/swr';
import type { InsightsResponse } from '@/app/api/insights/route';
import type { Figure, Ranking, FigureDetailResponse } from '@/types';
import type { LLMComparisonResponse } from '@/app/api/llm-comparison/route';

// Dynamic imports for Recharts-heavy components (reduces initial bundle by ~100KB)
const PairwiseScatter = dynamic(
  () => import('@/components/compare/PairwiseScatter').then(mod => ({ default: mod.PairwiseScatter })),
  { loading: () => <Skeleton className="h-[500px] w-full rounded-xl" />, ssr: false }
);

const BiasRadarGrid = dynamic(
  () => import('@/components/compare/BiasRadarGrid').then(mod => ({ default: mod.BiasRadarGrid })),
  { loading: () => <Skeleton className="h-[400px] w-full rounded-xl" />, ssr: false }
);

type ViewMode = 'overview' | 'agreement' | 'domain' | 'era' | 'pairwise' | 'lists' | 'insights';

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

const VIEW_MODES = ['overview', 'agreement', 'domain', 'era', 'pairwise', 'lists', 'insights'] as const;

function CompareContent() {
  const [showAllControversial, setShowAllControversial] = useState(false);
  const [activeList, setActiveList] = useState<ListEntry | null>(null);
  const [listOpen, setListOpen] = useState(false);

  // URL-persisted state using nuqs
  const [viewMode, setViewMode] = useQueryState(
    'view',
    parseAsStringLiteral(VIEW_MODES).withDefault('overview')
  );
  const [selectedModel1, setSelectedModel1] = useQueryState('m1');
  const [selectedModel2, setSelectedModel2] = useQueryState('m2');
  const [selectedId, setSelectedId] = useQueryState('figure');

  const { settings, updateSettings, resetSettings } = useSettings();

  // Fetch comparison data with SWR (cached, deduplicated)
  const {
    data,
    error: comparisonError,
    isLoading
  } = useSWR<LLMComparisonResponse>(
    '/api/llm-comparison',
    fetcher,
    comparisonDataConfig
  );

  // Set default models when data loads
  useEffect(() => {
    if (data?.models && data.models.length >= 2) {
      if (!selectedModel1) {
        setSelectedModel1(data.models[0].source);
      }
      if (!selectedModel2) {
        setSelectedModel2(data.models[1].source);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.models]);

  // Fetch figure details with SWR (only when selectedId exists)
  const {
    data: figureDetail,
    isLoading: isDetailLoading
  } = useSWR<FigureDetailResponse>(
    selectedId ? `/api/figures/${selectedId}` : null,
    fetcher,
    figureDetailConfig
  );

  // Derive figure and rankings from SWR response
  const selectedFigure = figureDetail?.figure ?? null;
  const selectedRankings = Array.isArray(figureDetail?.rankings) ? figureDetail.rankings : [];

  // Error message from comparison fetch
  const errorMessage = comparisonError ? 'Failed to fetch comparison data.' : null;

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

  // Fetch lists with SWR (only when on lists tab)
  const {
    data: listResponse,
    error: listError,
    isLoading: listLoading,
    mutate: refreshLists
  } = useSWR<{ lists: ListEntry[] }>(
    viewMode === 'lists' ? '/api/lists' : null,
    fetcher,
    listDataConfig
  );

  const listData = listResponse?.lists ?? [];

  // Fetch insights with SWR (only when on insights tab)
  const {
    data: insightsData,
    error: insightsError,
    isLoading: insightsLoading,
  } = useSWR<InsightsResponse>(
    viewMode === 'insights' ? '/api/insights' : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  const listsByModel = useMemo(() => {
    const map = new Map<string, ListEntry[]>();
    for (const entry of listData) {
      const label = entry.label || 'Other';
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(entry);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [listData]);

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
            <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto mb-6 sm:mb-8">
              <div className="flex gap-2 min-w-max sm:min-w-0 sm:flex-wrap pb-2 sm:pb-0">
                <button
                  onClick={() => setViewMode('overview')}
                  className={`px-4 py-2.5 sm:py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    viewMode === 'overview'
                      ? 'bg-stone-900 dark:bg-amber-900/50 text-white dark:text-amber-100'
                      : 'bg-white dark:bg-slate-800 text-stone-600 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700 border border-stone-200 dark:border-slate-700'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setViewMode('agreement')}
                  className={`px-4 py-2.5 sm:py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    viewMode === 'agreement'
                      ? 'bg-stone-900 dark:bg-amber-900/50 text-white dark:text-amber-100'
                      : 'bg-white dark:bg-slate-800 text-stone-600 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700 border border-stone-200 dark:border-slate-700'
                  }`}
                >
                  Agreement
                </button>
                <button
                  onClick={() => setViewMode('domain')}
                  className={`px-4 py-2.5 sm:py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    viewMode === 'domain'
                      ? 'bg-stone-900 dark:bg-amber-900/50 text-white dark:text-amber-100'
                      : 'bg-white dark:bg-slate-800 text-stone-600 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700 border border-stone-200 dark:border-slate-700'
                  }`}
                >
                  Domain
                </button>
                <button
                  onClick={() => setViewMode('era')}
                  className={`px-4 py-2.5 sm:py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    viewMode === 'era'
                      ? 'bg-stone-900 dark:bg-amber-900/50 text-white dark:text-amber-100'
                      : 'bg-white dark:bg-slate-800 text-stone-600 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700 border border-stone-200 dark:border-slate-700'
                  }`}
                >
                  Era
                </button>
                <button
                  onClick={() => setViewMode('pairwise')}
                  className={`px-4 py-2.5 sm:py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    viewMode === 'pairwise'
                      ? 'bg-stone-900 dark:bg-amber-900/50 text-white dark:text-amber-100'
                      : 'bg-white dark:bg-slate-800 text-stone-600 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700 border border-stone-200 dark:border-slate-700'
                  }`}
                >
                  <span className="sm:hidden">Compare</span>
                  <span className="hidden sm:inline">Pairwise</span>
                </button>
                <button
                  onClick={() => setViewMode('lists')}
                  className={`px-4 py-2.5 sm:py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    viewMode === 'lists'
                      ? 'bg-stone-900 dark:bg-amber-900/50 text-white dark:text-amber-100'
                      : 'bg-white dark:bg-slate-800 text-stone-600 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700 border border-stone-200 dark:border-slate-700'
                  }`}
                >
                  Lists
                </button>
                <button
                  onClick={() => setViewMode('insights')}
                  className={`px-4 py-2.5 sm:py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    viewMode === 'insights'
                      ? 'bg-stone-900 dark:bg-amber-900/50 text-white dark:text-amber-100'
                      : 'bg-white dark:bg-slate-800 text-stone-600 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700 border border-stone-200 dark:border-slate-700'
                  }`}
                >
                  Insights
                </button>
              </div>
            </div>

            {viewMode === 'overview' && (
              <div className="space-y-8">
                {/* Bias Radar Grid - Model Preferences at a Glance */}
                <section className="bg-white dark:bg-slate-800 rounded-2xl border border-stone-200 dark:border-slate-700 p-7">
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100">
                      Model Biases at a Glance
                    </h2>
                    <Tooltip
                      content="These radar charts show how each model's rankings differ from the consensus. Larger shapes in a direction mean the model favors that category more."
                      align="left"
                    >
                      <HelpCircle className="w-4 h-4 text-stone-400 cursor-help" />
                    </Tooltip>
                  </div>
                  <p className="text-sm text-stone-500 dark:text-slate-400 mb-6">
                    Compare how each model weights different domains and eras relative to the consensus ranking
                  </p>
                  <BiasRadarGrid
                    models={data.models}
                    onModelClick={(source) => {
                      setSelectedModel1(source);
                      setViewMode('pairwise');
                    }}
                  />
                </section>

                {/* Outlier Spotlight - Biggest Disagreements */}
                <section className="bg-white dark:bg-slate-800 rounded-2xl border border-stone-200 dark:border-slate-700 p-7">
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100">
                      Biggest Outliers
                    </h2>
                    <Tooltip
                      content="These are figures where one model's ranking differs most dramatically from the consensus. Each card shows the specific model and the rank difference."
                      align="left"
                    >
                      <HelpCircle className="w-4 h-4 text-stone-400 cursor-help" />
                    </Tooltip>
                  </div>
                  <p className="text-sm text-stone-500 dark:text-slate-400 mb-6">
                    Figures where individual models diverge most from the consensus
                  </p>
                  <OutlierSpotlight
                    models={data.models.map(m => ({
                      source: m.source,
                      label: m.label,
                      outliers: m.outliers,
                    }))}
                    onFigureClick={setSelectedId}
                  />
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

            {viewMode === 'agreement' && (
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
                          <span>72%+ (very high agreement)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400 dark:bg-emerald-500" />
                          <span>68–71% (high agreement)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-sm bg-lime-400 dark:bg-lime-500" />
                          <span>64–67% (good agreement)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-sm bg-lime-300 dark:bg-lime-400" />
                          <span>60–63% (moderate agreement)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-sm bg-amber-400 dark:bg-amber-500" />
                          <span>56–59% (mixed agreement)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-sm bg-orange-400 dark:bg-orange-500" />
                          <span>52–55% (low agreement)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-sm bg-rose-400 dark:bg-rose-500" />
                          <span>48–51% (very low)</span>
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
                    onClick={() => refreshLists()}
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
                  <div className="mt-6 text-sm text-stone-500">Failed to fetch list index.</div>
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

            {viewMode === 'insights' && (
              <section>
                {insightsLoading ? (
                  <div className="space-y-6">
                    <Skeleton className="h-32 w-full rounded-xl" />
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="h-24 rounded-xl" />
                      ))}
                    </div>
                    <Skeleton className="h-64 w-full rounded-xl" />
                    <Skeleton className="h-64 w-full rounded-xl" />
                  </div>
                ) : insightsError ? (
                  <div className="text-sm text-stone-500 dark:text-slate-400">
                    Failed to load insights data.
                  </div>
                ) : insightsData ? (
                  <InsightsPanel data={insightsData} />
                ) : null}
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
