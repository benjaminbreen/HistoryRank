'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense, startTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { RankingsTable } from '@/components/rankings/RankingsTable';
import { RankingsFilters } from '@/components/rankings/RankingsFilters';
import { ActiveFiltersBar } from '@/components/rankings/ActiveFiltersBar';
import { DownloadDropdown } from '@/components/rankings/DownloadDropdown';
import { FigureDetailPanel } from '@/components/detail/FigureDetailPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AppHeader } from '@/components/layout/AppHeader';
import { useSettings } from '@/hooks/useSettings';
import { fetcher, figureDetailConfig, listDataConfig } from '@/lib/swr';
import { BADGE_DEFINITIONS, type FigureRow, type Figure, type Ranking, type FiguresResponse, type FigureDetailResponse, type BadgeType } from '@/types';

// Load all ranked figures upfront for instant client-side filtering
const ALL_FIGURES_LIMIT = 2000;

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

  // Filters (local state for instant UI updates)
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState<string | null>(null);
  const [era, setEra] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('llmRank');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [region, setRegion] = useState<string | null>(null);
  const [modelSource, setModelSource] = useState<string | null>(null);
  const [badgeFilter, setBadgeFilter] = useState<BadgeType | null>(null);
  const [useWeightedAvg, setUseWeightedAvg] = useState(false);
  const { settings, updateSettings, resetSettings } = useSettings();
  const [shareOrigin, setShareOrigin] = useState('');
  const hasAnimatedCounts = useRef(false);
  const suppressFigureSync = useRef(false);

  // Build API URL - only changes when modelSource or weighted changes (requires server-side computation)
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', String(ALL_FIGURES_LIMIT));
    params.set('sortBy', 'llmRank');
    params.set('sortOrder', 'asc');
    // Only modelSource and weighted require server-side recomputation
    if (modelSource) params.set('modelSource', modelSource);
    if (useWeightedAvg) params.set('weighted', 'true');
    return `/api/figures?${params}`;
  }, [modelSource, useWeightedAvg]);

  // Fetch all figures once with SWR (refetches only when modelSource changes)
  const { data: figuresData, error: figuresError, isLoading } = useSWR<FiguresResponse>(
    apiUrl,
    fetcher,
    { ...listDataConfig, revalidateOnFocus: false }
  );

  // Extract data from SWR response
  const allFigures = figuresData?.figures ?? [];
  const totalLists = figuresData?.stats?.totalLists ?? 0;
  const totalModels = figuresData?.stats?.totalModels ?? 0;
  const errorMessage = figuresError ? 'Failed to fetch figures.' : null;

  // Display counters for animation
  const [displayTotal, setDisplayTotal] = useState(0);
  const [displayLists, setDisplayLists] = useState(0);
  const [displayModels, setDisplayModels] = useState(0);

  // Pagination state - how many to show (increases with "Load more")
  const [displayLimit, setDisplayLimit] = useState(500);

  // Reset display limit when filters change (so we start at 500 again)
  // Note: useWeightedAvg changes trigger API refetch via apiUrl, which resets data anyway
  useEffect(() => {
    setDisplayLimit(500);
  }, [domain, era, region, search, badgeFilter, modelSource]);

  // Client-side filtering and sorting (instant!)
  const filteredAndSorted = useMemo(() => {
    let filtered = allFigures;

    // Apply filters
    if (domain) {
      filtered = filtered.filter(f => f.domain === domain);
    }
    if (era) {
      filtered = filtered.filter(f => f.era === era);
    }
    if (region) {
      filtered = filtered.filter(f => f.regionSub === region);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(f =>
        f.name?.toLowerCase().includes(searchLower)
      );
    }
    if (badgeFilter) {
      filtered = filtered.filter(f => f.badges?.includes(badgeFilter));
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;

      switch (sortBy) {
        case 'llmRank':
          aVal = a.llmRank;
          bVal = b.llmRank;
          break;
        case 'hpiRank':
          aVal = a.hpiRank;
          bVal = b.hpiRank;
          break;
        case 'name':
          aVal = a.name?.toLowerCase() ?? '';
          bVal = b.name?.toLowerCase() ?? '';
          break;
        case 'domain':
          aVal = a.domain ?? '';
          bVal = b.domain ?? '';
          break;
        case 'era':
          aVal = a.era ?? '';
          bVal = b.era ?? '';
          break;
        case 'regionSub':
          aVal = a.regionSub ?? '';
          bVal = b.regionSub ?? '';
          break;
        case 'varianceScore':
          aVal = a.varianceScore;
          bVal = b.varianceScore;
          break;
        case 'pageviews':
          aVal = a.pageviews;
          bVal = b.pageviews;
          break;
        default:
          aVal = a.llmRank;
          bVal = b.llmRank;
      }

      // Handle nulls - push to end
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      // Compare
      let cmp: number;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        cmp = aVal.localeCompare(bVal);
      } else {
        cmp = (aVal as number) - (bVal as number);
      }

      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return sorted;
  }, [allFigures, domain, era, region, search, badgeFilter, sortBy, sortOrder]);

  // Total filtered count (before pagination)
  const total = filteredAndSorted.length;

  // Apply pagination - only show up to displayLimit
  const figures = useMemo(() => {
    return filteredAndSorted.slice(0, displayLimit);
  }, [filteredAndSorted, displayLimit]);

  // Load more handler
  const handleLoadMore = useCallback(() => {
    setDisplayLimit(prev => prev + 500);
  }, []);


  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLlmRank, setSelectedLlmRank] = useState<number | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  // Two-stage figure detail loading for faster initial render
  // Stage 1: Minimal data (fast, ~2-4KB) - shows immediately
  const { data: minimalDetail, isLoading: isMinimalLoading } = useSWR<FigureDetailResponse>(
    selectedId ? `/api/figures/${selectedId}/minimal` : null,
    fetcher,
    { ...figureDetailConfig, dedupingInterval: 60000 }
  );

  // Stage 2: Full data (slower, ~10-15KB) - loads in background for charts/extras
  const { data: fullDetail } = useSWR<FigureDetailResponse>(
    selectedId ? `/api/figures/${selectedId}` : null,
    fetcher,
    { ...figureDetailConfig, dedupingInterval: 300000 }
  );

  // Use full data when available, fall back to minimal
  const figureDetail = fullDetail ?? minimalDetail;
  const isDetailLoading = isMinimalLoading;
  // True when minimal data is loaded but full data is still fetching
  const isFullDataLoading = !!minimalDetail && !fullDetail;

  // Derive figure, rankings, and aliases from SWR response
  const selectedFigure = figureDetail?.figure ?? null;
  const selectedRankings = Array.isArray(figureDetail?.rankings) ? figureDetail.rankings : [];
  const selectedAliases = Array.isArray(fullDetail?.aliases) ? fullDetail.aliases : [];

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
      'mistral-large-3': 'Mistral Large 3',
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
    suppressFigureSync.current = true;
    startTransition(() => {
      setSelectedId(id);
      setSelectedRow(figure || null);
      setSelectedLlmRank(figure?.llmRank || null);
    });
  };

  // Prefetch figure details on hover (warms SWR cache before click)
  const prefetchedIds = useRef(new Set<string>());
  const handlePrefetch = useCallback((id: string) => {
    // Only prefetch once per session per figure
    if (prefetchedIds.current.has(id)) return;
    prefetchedIds.current.add(id);
    // Low-priority fetch that warms the cache
    fetch(`/api/figures/${id}`, { priority: 'low' as RequestPriority }).catch(() => {});
  }, []);

  // Animate counts when data first loads (use allFigures.length for total figures in DB)
  const totalFiguresInDb = allFigures.length;
  useEffect(() => {
    if (totalFiguresInDb <= 0 || totalModels <= 0 || totalLists <= 0) return;

    if (!hasAnimatedCounts.current) {
      hasAnimatedCounts.current = true;
      animateCount(totalFiguresInDb > 1 ? 1 : 0, totalFiguresInDb, 520, setDisplayTotal);
      animateCount(totalModels > 1 ? 1 : 0, totalModels, 820, setDisplayModels);
      animateCount(totalLists > 1 ? 1 : 0, totalLists, 640, setDisplayLists);
      return;
    }

    setDisplayTotal(totalFiguresInDb);
    setDisplayModels(totalModels);
    setDisplayLists(totalLists);
  }, [totalFiguresInDb, totalModels, totalLists, animateCount]);

  // Sync state from URL (shareable filters + deep links)
  // Note: We use a ref to track selectedId to avoid dependency loop
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    const nextSearch = searchParams.get('search') ?? '';
    const nextDomain = searchParams.get('domain');
    const nextEra = searchParams.get('era');
    const nextRegion = searchParams.get('region');
    const nextModel = searchParams.get('modelSource');
    const nextWeighted = searchParams.get('weighted') === 'true';
    const nextSortBy = searchParams.get('sortBy') ?? 'llmRank';
    const nextSortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') ?? 'asc';
    const nextBadge = searchParams.get('badge') as BadgeType | null;
    const nextFigure = searchParams.get('figure');

    setSearch(nextSearch);
    setDomain(nextDomain || null);
    setEra(nextEra || null);
    setRegion(nextRegion || null);
    setModelSource(nextModel || null);
    setUseWeightedAvg(nextWeighted);
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    setBadgeFilter(nextBadge && BADGE_DEFINITIONS[nextBadge] ? nextBadge : null);

    if (suppressFigureSync.current) {
      if (!nextFigure || nextFigure === selectedIdRef.current) {
        suppressFigureSync.current = false;
      } else {
        return;
      }
    }
    if (nextFigure && nextFigure !== selectedIdRef.current) {
      setSelectedId(nextFigure);
    }
  }, [searchParams]);

  // Update URL query params for shareable filters on the main table route
  // Debounced to reduce jank from frequent updates
  useEffect(() => {
    if (pathname !== '/') return;

    const timeout = setTimeout(() => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (domain) params.set('domain', domain);
      if (era) params.set('era', era);
      if (region) params.set('region', region);
      if (modelSource) params.set('modelSource', modelSource);
      if (useWeightedAvg) params.set('weighted', 'true');
      if (badgeFilter) params.set('badge', badgeFilter);
      if (sortBy !== 'llmRank') params.set('sortBy', sortBy);
      if (sortOrder !== 'asc') params.set('sortOrder', sortOrder);
      if (selectedId) params.set('figure', selectedId);

      const nextQuery = params.toString();
      const currentQuery = searchParams.toString();
      if (nextQuery !== currentQuery) {
        router.replace(nextQuery ? `/?${nextQuery}` : '/', { scroll: false });
      }
    }, 150); // Small debounce to batch rapid filter changes

    return () => clearTimeout(timeout);
  }, [
    pathname,
    search,
    domain,
    era,
    region,
    modelSource,
    useWeightedAvg,
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

  // Navigation for detail panel (prev/next figure)
  const currentFigureIndex = useMemo(() => {
    if (!selectedId) return -1;
    return figures.findIndex(f => f.id === selectedId);
  }, [selectedId, figures]);

  const handlePreviousFigure = useCallback(() => {
    if (currentFigureIndex > 0) {
      handleSelectFigure(figures[currentFigureIndex - 1].id);
    }
  }, [currentFigureIndex, figures]);

  const handleNextFigure = useCallback(() => {
    if (currentFigureIndex >= 0 && currentFigureIndex < figures.length - 1) {
      handleSelectFigure(figures[currentFigureIndex + 1].id);
    }
  }, [currentFigureIndex, figures]);

  const shareUrl = useMemo(() => {
    if (!shareOrigin) return '';
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (domain) params.set('domain', domain);
    if (era) params.set('era', era);
    if (region) params.set('region', region);
    if (modelSource) params.set('modelSource', modelSource);
    if (useWeightedAvg) params.set('weighted', 'true');
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
    useWeightedAvg,
    badgeFilter,
    sortBy,
    sortOrder,
  ]);



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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {errorMessage && (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {errorMessage} Try refreshing or check the deployment logs.
          </div>
        )}
        {/* Stats bar */}
        <div className="mb-4 sm:mb-6">
          <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
            <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-6 gap-y-2">
              <Link
                href="/fulllist"
                className="flex items-baseline gap-1 sm:gap-1.5 rounded-full border border-transparent px-1.5 sm:px-2 py-1 transition-all hover:border-stone-200/70 hover:bg-white/70 hover:shadow-sm active:translate-y-[2px] active:scale-[0.98]"
              >
                {isLoading ? (
                  <Skeleton className="h-6 sm:h-7 w-12 sm:w-16" />
                ) : (
                  <span className="font-mono text-xl sm:text-2xl font-semibold text-stone-900 dark:text-amber-100">{displayTotal}</span>
                )}
                <span className="text-xs sm:text-sm text-stone-500 dark:text-slate-400">figures</span>
              </Link>
              <div className="h-4 w-px bg-stone-300 dark:bg-slate-600 hidden sm:block" />
              <Link
                href="/compare?view=overview"
                className="flex items-baseline gap-1 sm:gap-1.5 rounded-full border border-transparent px-1.5 sm:px-2 py-1 transition-all hover:border-stone-200/70 hover:bg-white/70 hover:shadow-sm active:translate-y-[2px] active:scale-[0.98]"
              >
                {isLoading ? (
                  <Skeleton className="h-6 sm:h-7 w-8 sm:w-10" />
                ) : (
                  <span className="font-mono text-xl sm:text-2xl font-semibold text-stone-900 dark:text-amber-100">{displayModels || '–'}</span>
                )}
                <span className="text-xs sm:text-sm text-stone-500 dark:text-slate-400">models</span>
              </Link>
              <div className="h-4 w-px bg-stone-300 dark:bg-slate-600 hidden sm:block" />
              <div className="flex items-baseline gap-1 sm:gap-1.5 rounded-full border border-transparent px-1.5 sm:px-2 py-1 transition-all hover:border-stone-200/70 hover:bg-white/70 hover:shadow-sm active:translate-y-[2px] active:scale-[0.98]">
                {isLoading ? (
                  <Skeleton className="h-6 sm:h-7 w-8 sm:w-10" />
                ) : (
                  <span className="font-mono text-xl sm:text-2xl font-semibold text-stone-900 dark:text-amber-100">{displayLists || '–'}</span>
                )}
                <span className="text-xs sm:text-sm text-stone-500 dark:text-slate-400">lists</span>
              </div>
            </div>

            {/* Weighted Average Toggle */}
            <div className="flex items-center gap-2">
              <div className="relative group">
                <button
                  onClick={() => setUseWeightedAvg(!useWeightedAvg)}
                  disabled={!!modelSource}
                  className={`
                    flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all
                    ${modelSource
                      ? 'bg-stone-100 text-stone-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500'
                      : useWeightedAvg
                        ? 'bg-amber-100 text-amber-800 border border-amber-300 shadow-sm dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700'
                        : 'bg-white/70 text-stone-600 border border-stone-200/70 hover:bg-white hover:border-stone-300 hover:shadow-sm dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800'
                    }
                  `}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                  </svg>
                  <span>Weighted Avg</span>
                  {useWeightedAvg && (
                    <span className="ml-1 text-[10px] bg-amber-200 dark:bg-amber-800 px-1.5 py-0.5 rounded-full">ON</span>
                  )}
                </button>

                {/* Tooltip */}
                <div className="absolute right-0 top-full mt-2 w-72 p-3 bg-stone-900 dark:bg-slate-950 text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <div className="font-semibold mb-2">Quality-Weighted Consensus</div>
                  <p className="text-stone-300 dark:text-slate-300 mb-2">
                    Applies reliability weights to each model based on automated quality assessment (duplicates, pattern collapse) and LLM evaluation.
                  </p>
                  <p className="text-stone-400 dark:text-slate-400 mb-2">
                    Weights reflect an average of suggested scores from multiple list audits by GPT-5.2 and Claude Opus 4.5.
                  </p>
                  <div className="space-y-1 text-[10px] text-stone-400 dark:text-slate-400">
                    <div className="flex justify-between"><span>Claude Opus</span><span className="text-emerald-400">1.0×</span></div>
                    <div className="flex justify-between"><span>GPT-5.2 Thinking</span><span className="text-emerald-400">0.79×</span></div>
                    <div className="flex justify-between"><span>Claude Sonnet</span><span className="text-amber-400">0.54×</span></div>
                    <div className="flex justify-between"><span>Gemini Pro, Gemini Flash</span><span className="text-amber-400">0.33× / 0.29×</span></div>
                    <div className="flex justify-between"><span>Grok 4, Qwen</span><span className="text-orange-400">0.29× / 0.26×</span></div>
                    <div className="flex justify-between"><span>DeepSeek, Grok 4.1, GLM</span><span className="text-orange-400">0.18× / 0.18× / 0.11×</span></div>
                    <div className="flex justify-between"><span>Mistral Large</span><span className="text-red-400">0.05×</span></div>
                  </div>
                  {modelSource && (
                    <p className="mt-2 text-amber-400 text-[10px]">
                      Disabled when viewing single model rankings.
                    </p>
                  )}
                  <div className="absolute -top-1 right-4 w-2 h-2 bg-stone-900 dark:bg-slate-950 rotate-45" />
                </div>
              </div>

              {/* Download Dropdown */}
              <DownloadDropdown
                figures={filteredAndSorted}
                filters={{
                  domain,
                  era,
                  region,
                  search,
                  modelSource,
                  useWeightedAvg,
                }}
              />
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
            isLoading={isLoading}
            resultCount={figures.length}
            totalCount={total}
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
          // figures is paginated (sliced), total is the full filtered count
          const visibleCount = figures.length;
          const totalCount = total;
          const hasMore = figures.length < total;

          return isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : figures.length === 0 ? (
            (() => {
              const activeFilterCount = [search, domain, era, region, modelSource, badgeFilter].filter(Boolean).length;
              return (
                <div className="text-center py-12">
                  <p className="text-stone-500 dark:text-slate-400">
                    No figures found matching your filters.
                  </p>
                  {activeFilterCount > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm text-stone-400 dark:text-slate-500">
                        {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
                      </p>
                      <button
                        onClick={() => {
                          setSearch('');
                          setDomain(null);
                          setEra(null);
                          setRegion(null);
                          setModelSource(null);
                          setBadgeFilter(null);
                        }}
                        className="text-sm text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400 font-medium underline underline-offset-2"
                      >
                        Clear all filters
                      </button>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <>
              <RankingsTable
                figures={figures}
                onSelectFigure={handleSelectFigure}
                onPrefetch={handlePrefetch}
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
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  className="px-8"
                >
                  Load more ({total - figures.length} remaining)
                </Button>
              </div>
            )}
            {visibleCount > 0 && (
              <div className="mt-3 text-center text-sm text-stone-500 dark:text-slate-400">
                Showing {visibleCount} of {totalCount} figures
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
          className="fixed bottom-6 z-40 flex items-center gap-2 rounded-full border border-stone-200/70 bg-white/90 px-4 py-2 text-xs font-medium text-stone-700 shadow-md backdrop-blur transition-all hover:-translate-y-1 hover:border-stone-300 hover:text-stone-900 hover:shadow-lg dark:border-amber-900/40 dark:bg-slate-950/80 dark:text-slate-200 dark:hover:border-amber-700/60 dark:hover:text-amber-100"
          style={{ right: 'max(1.5rem, calc((100vw - 80rem) / 2))' }}
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
        isFullDataLoading={isFullDataLoading}
        llmRank={selectedLlmRank}
        onPrevious={handlePreviousFigure}
        onNext={handleNextFigure}
        hasPrevious={currentFigureIndex > 0}
        hasNext={currentFigureIndex >= 0 && currentFigureIndex < figures.length - 1}
        onNavigate={setSelectedId}
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
