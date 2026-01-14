'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { RankingsTable } from '@/components/rankings/RankingsTable';
import { RankingsFilters } from '@/components/rankings/RankingsFilters';
import { ActiveFiltersBar } from '@/components/rankings/ActiveFiltersBar';
import { FigureDetailPanel } from '@/components/detail/FigureDetailPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AppHeader } from '@/components/layout/AppHeader';
import { useSettings } from '@/hooks/useSettings';
import { BADGE_DEFINITIONS, type FigureRow, type Figure, type Ranking, type FiguresResponse, type FigureDetailResponse, type BadgeType } from '@/types';

const PAGE_SIZE = 500;

// Loading fallback component
function HomeLoading() {
  return (
    <main className="min-h-screen bg-transparent">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          {[...Array(10)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </main>
  );
}

// Main content component that uses useSearchParams
function HomeContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // State
  const [figures, setFigures] = useState<FigureRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalLists, setTotalLists] = useState(0);
  const [totalModels, setTotalModels] = useState(0);
  const [displayTotal, setDisplayTotal] = useState(0);
  const [displayLists, setDisplayLists] = useState(0);
  const [displayModels, setDisplayModels] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

  // Filters
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState<string | null>(null);
  const [era, setEra] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('llmRank');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [modelSource, setModelSource] = useState<string | null>(null);
  const [badgeFilter, setBadgeFilter] = useState<BadgeType | null>(null);
  const { settings, updateSettings, resetSettings } = useSettings();
  const [shareOrigin, setShareOrigin] = useState('');
  const hasAnimatedCounts = useRef(false);
  const suppressFigureSync = useRef(false);

  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLlmRank, setSelectedLlmRank] = useState<number | null>(null);
  const [selectedFigure, setSelectedFigure] = useState<Figure | null>(null);
  const [selectedRankings, setSelectedRankings] = useState<Ranking[]>([]);
  const [selectedAliases, setSelectedAliases] = useState<string[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  // Selected row for immediate display
  const [selectedRow, setSelectedRow] = useState<FigureRow | null>(null);

  const modelLabel = useMemo(() => {
    if (!modelSource) return null;
    const labels: Record<string, string> = {
      'claude-opus-4.5': 'Claude Opus 4.5',
      'claude-sonnet-4.5': 'Claude Sonnet 4.5',
      'deepseek-v3.2': 'DeepSeek v3.2',
      'gemini-flash-3-preview': 'Gemini Flash 3 Preview',
      'gemini-pro-3': 'Gemini Pro 3',
      'gpt-5.2-thinking': 'GPT 5.2 Thinking',
      'grok-4.1-fast': 'Grok 4.1 Fast',
      'qwen3': 'Qwen 3',
    };
    return labels[modelSource] || modelSource;
  }, [modelSource]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShareOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const animateCount = useCallback((
    from: number,
    to: number,
    durationMs: number,
    onUpdate: (value: number) => void,
    onDone?: () => void
  ) => {
    const startTime = performance.now();
    const diff = to - from;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 4);
      const nextValue = Math.round(from + diff * eased);
      onUpdate(nextValue);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else if (onDone) {
        onDone();
      }
    };

    requestAnimationFrame(tick);
  }, []);

  // Handle figure selection - store both id and llmRank
  const handleSelectFigure = (id: string) => {
    const figure = figures.find(f => f.id === id);
    setSelectedId(id);
    setSelectedRow(figure || null);
    setSelectedLlmRank(figure?.llmRank || null);
  };

  // Fetch figures
  const fetchFigures = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setDisplayLimit(PAGE_SIZE); // Reset pagination when filters change
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (domain) params.set('domain', domain);
      if (era) params.set('era', era);
      if (region) params.set('region', region);
      if (modelSource) params.set('modelSource', modelSource);
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
      // When badge filter is active, fetch all figures so we can show all matches
      // Badge-filtered results are small (10-30), so this is fast
      params.set('limit', badgeFilter ? '5000' : '1000');

      const res = await fetch(`/api/figures?${params}`);
      if (!res.ok) {
        setFigures([]);
        setTotal(0);
        setErrorMessage(`Failed to fetch figures (${res.status}).`);
        return;
      }
      const data: FiguresResponse = await res.json();
      const nextFigures = Array.isArray(data?.figures) ? data.figures : [];

      setFigures(nextFigures);
      setTotal(typeof data?.total === 'number' ? data.total : nextFigures.length);
      if (data?.stats) {
        setTotalLists(data.stats.totalLists);
        setTotalModels(data.stats.totalModels);
      }
    } catch (error) {
      console.error('Failed to fetch figures:', error);
      setFigures([]);
      setTotal(0);
      setErrorMessage('Failed to fetch figures.');
    } finally {
      setIsLoading(false);
    }
  }, [search, domain, era, region, modelSource, sortBy, sortOrder, badgeFilter]);

  // Fetch on mount and when filters change
  useEffect(() => {
    const debounce = setTimeout(fetchFigures, 300);
    return () => clearTimeout(debounce);
  }, [fetchFigures]);

  useEffect(() => {
    if (total <= 0 || totalModels <= 0 || totalLists <= 0) return;

    if (!hasAnimatedCounts.current) {
      hasAnimatedCounts.current = true;
      animateCount(total > 1 ? 1 : 0, total, 520, setDisplayTotal);
      animateCount(totalModels > 1 ? 1 : 0, totalModels, 820, setDisplayModels);
      animateCount(totalLists > 1 ? 1 : 0, totalLists, 640, setDisplayLists);
      return;
    }

    setDisplayTotal(total);
    setDisplayModels(totalModels);
    setDisplayLists(totalLists);
  }, [total, totalModels, totalLists, animateCount]);

  // Sync state from URL (shareable filters + deep links)
  useEffect(() => {
    const nextSearch = searchParams.get('search') ?? '';
    const nextDomain = searchParams.get('domain');
    const nextEra = searchParams.get('era');
    const nextRegion = searchParams.get('region');
    const nextModel = searchParams.get('modelSource');
    const nextSortBy = searchParams.get('sortBy') ?? 'llmRank';
    const nextSortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') ?? 'asc';
    const nextBadge = searchParams.get('badge') as BadgeType | null;
    const nextFigure = searchParams.get('figure');

    setSearch(nextSearch);
    setDomain(nextDomain || null);
    setEra(nextEra || null);
    setRegion(nextRegion || null);
    setModelSource(nextModel || null);
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    setBadgeFilter(nextBadge && BADGE_DEFINITIONS[nextBadge] ? nextBadge : null);

    if (suppressFigureSync.current && nextFigure) {
      return;
    }
    if (!nextFigure) {
      suppressFigureSync.current = false;
    }
    if (nextFigure && nextFigure !== selectedId) {
      setSelectedId(nextFigure);
    }
  }, [searchParams, selectedId]);

  // Update URL query params for shareable filters on the main table route
  useEffect(() => {
    if (pathname !== '/') return;
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (domain) params.set('domain', domain);
    if (era) params.set('era', era);
    if (region) params.set('region', region);
    if (modelSource) params.set('modelSource', modelSource);
    if (badgeFilter) params.set('badge', badgeFilter);
    if (sortBy !== 'llmRank') params.set('sortBy', sortBy);
    if (sortOrder !== 'asc') params.set('sortOrder', sortOrder);
    if (selectedId) params.set('figure', selectedId);

    const nextQuery = params.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `/?${nextQuery}` : '/', { scroll: false });
    }
  }, [
    pathname,
    search,
    domain,
    era,
    region,
    modelSource,
    badgeFilter,
    sortBy,
    sortOrder,
    selectedId,
    router,
    searchParams,
  ]);

  const handleCloseDetail = useCallback(() => {
    suppressFigureSync.current = true;
    setSelectedId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('figure');
    const nextQuery = params.toString();
    router.replace(nextQuery ? `/?${nextQuery}` : '/', { scroll: false });
  }, [router, searchParams]);

  const shareUrl = useMemo(() => {
    if (!shareOrigin) return '';
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (domain) params.set('domain', domain);
    if (era) params.set('era', era);
    if (region) params.set('region', region);
    if (modelSource) params.set('modelSource', modelSource);
    if (badgeFilter) params.set('badge', badgeFilter);
    if (sortBy !== 'llmRank') params.set('sortBy', sortBy);
    if (sortOrder !== 'asc') params.set('sortOrder', sortOrder);
    return `${shareOrigin}/?${params.toString()}`;
  }, [
    shareOrigin,
    search,
    domain,
    era,
    region,
    modelSource,
    badgeFilter,
    sortBy,
    sortOrder,
  ]);


  // Fetch figure details when selected
  useEffect(() => {
    if (!selectedId) {
      setSelectedFigure(null);
      setSelectedRankings([]);
      setSelectedAliases([]);
      return;
    }

    const fetchDetail = async () => {
      setIsDetailLoading(true);
      try {
        const res = await fetch(`/api/figures/${selectedId}`);
        if (!res.ok) {
          setSelectedFigure(null);
          setSelectedRankings([]);
          setSelectedAliases([]);
          return;
        }
        const data: FigureDetailResponse = await res.json();
        setSelectedFigure(data?.figure ?? null);
        setSelectedRankings(Array.isArray(data?.rankings) ? data.rankings : []);
        setSelectedAliases(Array.isArray(data?.aliases) ? data.aliases : []);
      } catch (error) {
        console.error('Failed to fetch figure detail:', error);
        setSelectedFigure(null);
        setSelectedRankings([]);
        setSelectedAliases([]);
      } finally {
        setIsDetailLoading(false);
      }
    };

    fetchDetail();
  }, [selectedId]);

  // Handle sort
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  // Keyboard navigation through the list
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle arrow keys when we have figures and a selection (panel is open)
      if (figures.length === 0) return;

      // Don't intercept if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const isNext = e.key === 'ArrowDown' || e.key === 'ArrowRight';
      const isPrev = e.key === 'ArrowUp' || e.key === 'ArrowLeft';

      if (!isNext && !isPrev) return;

      e.preventDefault();

      // If no selection, select the first figure
      if (!selectedId) {
        if (figures.length > 0) {
          handleSelectFigure(figures[0].id);
        }
        return;
      }

      const currentIndex = figures.findIndex(f => f.id === selectedId);
      if (currentIndex === -1) return;

      let newIndex: number;
      if (isNext) {
        newIndex = currentIndex + 1;
        if (newIndex >= figures.length) newIndex = 0; // Wrap to start
      } else {
        newIndex = currentIndex - 1;
        if (newIndex < 0) newIndex = figures.length - 1; // Wrap to end
      }

      const newFigure = figures[newIndex];
      if (newFigure) {
        handleSelectFigure(newFigure.id);

        // Scroll the row into view
        const row = document.querySelector(`[data-figure-id="${newFigure.id}"]`);
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [figures, selectedId]);

  return (
    <main className="min-h-screen bg-transparent">
      <AppHeader
        active="table"
        settings={settings}
        onSettingsChange={updateSettings}
        onSettingsReset={resetSettings}
      />

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {errorMessage && (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {errorMessage} Try refreshing or check the deployment logs.
          </div>
        )}
        {/* Stats bar */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4">
            <div className="flex items-baseline gap-1.5 rounded-full border border-transparent px-2 py-1 transition-all hover:border-stone-200/70 hover:bg-white/70 hover:shadow-sm active:translate-y-[2px] active:scale-[0.98]">
              <span className="font-mono text-2xl font-semibold text-stone-900 dark:text-amber-100">{displayTotal}</span>
              <span className="text-sm text-stone-500 dark:text-slate-400">figures</span>
            </div>
            <div className="h-4 w-px bg-stone-300 dark:bg-slate-600 hidden sm:block" />
            <Link
              href="/compare?view=overview"
              className="flex items-baseline gap-1.5 rounded-full border border-transparent px-2 py-1 transition-all hover:border-stone-200/70 hover:bg-white/70 hover:shadow-sm active:translate-y-[2px] active:scale-[0.98]"
            >
              <span className="font-mono text-2xl font-semibold text-stone-900 dark:text-amber-100">{displayModels || '–'}</span>
              <span className="text-sm text-stone-500 dark:text-slate-400">LLM models</span>
            </Link>
            <div className="h-4 w-px bg-stone-300 dark:bg-slate-600 hidden sm:block" />
            <div className="flex items-baseline gap-1.5 rounded-full border border-transparent px-2 py-1 transition-all hover:border-stone-200/70 hover:bg-white/70 hover:shadow-sm active:translate-y-[2px] active:scale-[0.98]">
              <span className="font-mono text-2xl font-semibold text-stone-900 dark:text-amber-100">{displayLists || '–'}</span>
              <span className="text-sm text-stone-500 dark:text-slate-400">ranked lists</span>
            </div>
          </div>

          <details className="group rounded-2xl border border-stone-200/70 dark:border-amber-900/30 bg-white/60 dark:bg-slate-800/50 backdrop-blur-sm shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <summary className="cursor-pointer list-none px-4 py-3 sm:px-5 sm:py-4 text-stone-600 dark:text-slate-300 hover:text-stone-900 dark:hover:text-amber-200 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-amber-500/80">
                    Methodology at a glance
                  </span>
                  <span className="font-serif text-[17px] leading-relaxed text-stone-700 dark:text-slate-200">
                    Combining academic rankings, Wikipedia metrics, and AI assessments to create both an educational resource
                    and a new approach to &quot;AI scrutability&quot; by revealing how language models assess and explain the
                    significance of human history.
                  </span>
                </div>
                <svg
                  className="mt-1 w-4 h-4 shrink-0 text-stone-400 dark:text-slate-500 group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </summary>
            <div className="px-4 pb-4 sm:px-5 sm:pb-5 text-sm text-stone-600 dark:text-slate-300 leading-relaxed space-y-3">
              <p>
                These rankings combine <a href="https://pantheon.world" className="text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 underline underline-offset-2" target="_blank" rel="noopener noreferrer">MIT&apos;s Pantheon database</a> (an academic historical importance index),
                Wikipedia page views, and averaged assessments from frontier LLM models (Claude, Gemini, GPT) into a single table.
              </p>
              <p>
                The goal is to surface how different AI models evaluate historical significance and reveal potential biases
                in how we collectively remember the past.
              </p>
              <p className="text-xs text-stone-500 dark:text-slate-400">
                Created by Benjamin Breen at UC Santa Cruz. Built with Claude Code.
              </p>
            </div>
          </details>
        </div>

        {/* Filters */}
        <div className="mb-4">
          <RankingsFilters
            search={search}
            onSearchChange={setSearch}
            domain={domain}
            onDomainChange={setDomain}
            era={era}
            onEraChange={setEra}
            region={region}
            onRegionChange={setRegion}
            modelSource={modelSource}
            onModelSourceChange={setModelSource}
            badgeFilter={badgeFilter}
            onBadgeFilterChange={setBadgeFilter}
          />
        </div>
        <div className="sticky top-[60px] z-40 mb-6">
          <ActiveFiltersBar
            search={search}
            domain={domain}
            era={era}
            region={region}
            modelSource={modelSource}
            badgeFilter={badgeFilter}
            sortBy={sortBy}
            sortOrder={sortOrder}
            modelLabel={modelLabel}
            shareUrl={shareUrl}
            onSearchChange={setSearch}
            onDomainChange={setDomain}
            onEraChange={setEra}
            onRegionChange={setRegion}
            onModelSourceChange={setModelSource}
            onBadgeFilterChange={setBadgeFilter}
            onSortChange={(value, order) => {
              setSortBy(value);
              setSortOrder(order);
            }}
          />
        </div>

        {/* Table */}
        {(() => {
          // Apply badge filter client-side
          const filteredFigures = badgeFilter
            ? figures.filter(f => f.badges.includes(badgeFilter))
            : figures;

          return isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filteredFigures.length === 0 ? (
            <div className="text-center py-12 text-stone-500">
              {badgeFilter ? (
                <>No figures found with the selected badge. Try a different filter.</>
              ) : (
                <>No figures found matching your filters.</>
              )}
            </div>
          ) : (
            <>
              <RankingsTable
                figures={filteredFigures.slice(0, displayLimit)}
              onSelectFigure={handleSelectFigure}
              selectedId={selectedId}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
              density={settings.density}
              fontScale={settings.fontScale}
              thumbnailSize={
                settings.thumbnailSize === 'sm'
                  ? 30
                  : settings.thumbnailSize === 'lg'
                    ? 46
                    : 38
              }
              visibleColumns={{
                region: settings.showRegion,
                era: settings.showEra,
                variance: settings.showVariance,
                views: settings.showViews,
              }}
            />
            {filteredFigures.length > displayLimit && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => setDisplayLimit(prev => prev + PAGE_SIZE)}
                  className="px-8"
                >
                  Load more ({filteredFigures.length - displayLimit} remaining)
                </Button>
              </div>
            )}
            {filteredFigures.length > 0 && (
              <div className="mt-3 text-center text-sm text-stone-500 dark:text-slate-400">
                Showing {Math.min(displayLimit, filteredFigures.length)} of {filteredFigures.length} figures
                {badgeFilter && ` (filtered by badge)`}
              </div>
            )}
          </>
          );
        })()}

        {/* Legend */}
        <div className="mt-6 p-4 bg-white dark:bg-slate-800/80 rounded-lg border border-stone-200 dark:border-amber-900/30">
          <h3 className="text-sm font-medium text-stone-700 dark:text-amber-200 mb-2">Legend</h3>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-stone-600 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-medium">LLM:</span>
              <span>Position based on combined AI rankings (Claude, Gemini)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">HPI:</span>
              <span>MIT Pantheon Historical Popularity Index rank</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Variance:</span>
              <span>Disagreement between sources (high = controversial)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Views:</span>
              <span>Wikipedia pageviews (2025)</span>
            </div>
          </div>
        </div>
      </div>

      {showBackToTop && selectedId === null && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-stone-200/70 bg-white/90 px-4 py-2 text-xs font-medium text-stone-700 shadow-md backdrop-blur transition-all hover:-translate-y-1 hover:border-stone-300 hover:text-stone-900 hover:shadow-lg dark:border-amber-900/40 dark:bg-slate-950/80 dark:text-slate-200 dark:hover:border-amber-700/60 dark:hover:text-amber-100"
          aria-label="Back to top"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-stone-100 text-stone-600 dark:bg-slate-900 dark:text-amber-200">
            ^
          </span>
          Back to top
        </button>
      )}

      {/* Detail Panel */}
      <FigureDetailPanel
        figure={selectedFigure}
        previewRow={selectedRow}
        rankings={selectedRankings}
        aliases={selectedAliases}
        isOpen={selectedId !== null}
        onClose={handleCloseDetail}
        isLoading={isDetailLoading}
        llmRank={selectedLlmRank}
      />
    </main>
  );
}

// Default export wraps HomeContent in Suspense for useSearchParams
export default function Home() {
  return (
    <Suspense fallback={<HomeLoading />}>
      <HomeContent />
    </Suspense>
  );
}
