'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { RankingsTable } from '@/components/rankings/RankingsTable';
import { RankingsFilters } from '@/components/rankings/RankingsFilters';
import { FigureDetailPanel } from '@/components/detail/FigureDetailPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Menu, ScatterChart, ExternalLink, Moon, Sun } from 'lucide-react';
import { useDarkMode } from '@/hooks/useDarkMode';
import type { FigureRow, Figure, Ranking, FiguresResponse, FigureDetailResponse } from '@/types';

const PAGE_SIZE = 500;

export default function Home() {
  // State
  const [figures, setFigures] = useState<FigureRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalLists, setTotalLists] = useState(0);
  const [totalModels, setTotalModels] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

  // Filters
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState<string | null>(null);
  const [era, setEra] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('llmRank');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCompactHeader, setIsCompactHeader] = useState(false);
  const [region, setRegion] = useState<string | null>(null);
  const [modelSource, setModelSource] = useState<string | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  // Dark mode hook
  const { isDarkMode, mounted, toggleDarkMode } = useDarkMode();

  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLlmRank, setSelectedLlmRank] = useState<number | null>(null);
  const [selectedFigure, setSelectedFigure] = useState<Figure | null>(null);
  const [selectedRankings, setSelectedRankings] = useState<Ranking[]>([]);
  const [selectedAliases, setSelectedAliases] = useState<string[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Selected row for immediate display
  const [selectedRow, setSelectedRow] = useState<FigureRow | null>(null);

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
      params.set('limit', '1000'); // Get all for now

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
  }, [search, domain, era, region, modelSource, sortBy, sortOrder]);

  // Fetch on mount and when filters change
  useEffect(() => {
    const debounce = setTimeout(fetchFigures, 300);
    return () => clearTimeout(debounce);
  }, [fetchFigures]);

  useEffect(() => {
    const onScroll = () => setIsCompactHeader(window.scrollY > 48);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
      <header
        className="sticky top-0 z-50 border-b border-stone-200/60 dark:border-amber-900/30 shadow-sm transition-all duration-300 ease-out"
        style={{
          padding: isCompactHeader ? '12px 0' : '20px 0',
          backgroundColor: mounted && isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(250, 250, 247, 0.7)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between gap-4">
            {/* Logo - clickable to open About modal */}
            <button
              onClick={() => setIsAboutOpen(true)}
              className="hr-logo flex items-center gap-3 cursor-pointer text-left"
              aria-label="Open About"
            >
              <div
                className="hr-logo-icon rounded-full border border-stone-300 dark:border-amber-800/50 bg-stone-50 dark:bg-slate-800 text-stone-800 dark:text-amber-200 flex items-center justify-center font-serif text-xs tracking-wide"
                style={{
                  width: isCompactHeader ? '36px' : '40px',
                  height: isCompactHeader ? '36px' : '40px',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              >
                HR
              </div>
              <div className="overflow-hidden">
                <h1
                  className="font-serif font-semibold text-stone-900 dark:text-amber-100"
                  style={{
                    fontSize: isCompactHeader ? '1.25rem' : '1.75rem',
                    lineHeight: 1.2,
                    transition: 'font-size 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                >
                  HistoryRank
                </h1>
                <p
                  className="hr-logo-text text-stone-500 dark:text-slate-400 text-sm overflow-hidden"
                  style={{
                    maxHeight: isCompactHeader ? '0px' : '24px',
                    opacity: isCompactHeader ? 0 : 1,
                    marginTop: isCompactHeader ? '0px' : '2px',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                >
                  Comparing historical importance across rankings
                </p>
              </div>
            </button>

            {/* Navigation */}
            <div className="flex flex-wrap items-center gap-1 md:gap-2">
              <button
                onClick={() => setIsAboutOpen(true)}
                className="text-sm text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200 px-2 py-1 transition-colors"
              >
                About
              </button>
              <Link
                href="/methodology"
                className="text-sm text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200 px-2 py-1 transition-colors"
              >
                Methodology
              </Link>
              <Link href="/scatter">
                <Button variant="outline" size="sm" className="gap-2">
                  <ScatterChart className="h-4 w-4" />
                  <span className="hidden sm:inline">Scatter</span>
                </Button>
              </Link>
              {/* Dark Mode Toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={toggleDarkMode}
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                className="relative overflow-hidden"
              >
                <div className="relative w-4 h-4">
                  <Sun
                    className={`h-4 w-4 absolute inset-0 transition-all duration-300 ${
                      isDarkMode ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
                    }`}
                  />
                  <Moon
                    className={`h-4 w-4 absolute inset-0 transition-all duration-300 ${
                      isDarkMode ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'
                    }`}
                  />
                </div>
              </Button>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" aria-label="Open settings">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-[320px] bg-stone-50">
                  <SheetHeader>
                    <SheetTitle className="font-serif text-stone-900">Settings</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4 rounded-md border border-stone-200 bg-white p-3 text-sm text-stone-600">
                    Settings will live here (display, data filters, exports).
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      {/* About Modal */}
      <Dialog open={isAboutOpen} onOpenChange={setIsAboutOpen}>
        <DialogContent className="sm:max-w-lg bg-[#faf9f7]">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-stone-900">About HistoryRank</DialogTitle>
            <DialogDescription className="text-stone-600">
              Comparing historical importance across human and machine ranking systems
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-stone-700 leading-relaxed">
            <p>
              HistoryRank is an experimental tool for comparing how different sources evaluate historical significance.
              We combine data from academic rankings, Wikipedia metrics, and AI assessments to reveal interesting
              patterns in how we collectively remember the past.
            </p>
            <div className="p-4 bg-white rounded-lg border border-stone-200">
              <h4 className="font-medium text-stone-900 mb-2">Data Sources</h4>
              <ul className="space-y-1.5 text-stone-600">
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-0.5">•</span>
                  <span><strong>MIT Pantheon</strong> — Academic historical importance index</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-0.5">•</span>
                  <span><strong>Wikipedia</strong> — Pageviews and article metrics</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-0.5">•</span>
                  <span><strong>Claude & Gemini</strong> — AI model assessments</span>
                </li>
              </ul>
            </div>
            <p className="text-stone-500 text-xs">
              The "Attention Gap" metric highlights figures where AI and academic rankings diverge significantly,
              revealing potential biases or overlooked historical figures.
            </p>
            <div className="flex items-center justify-between pt-2">
              <Link
                href="/methodology"
                onClick={() => setIsAboutOpen(false)}
                className="text-sm text-stone-600 hover:text-stone-900 underline underline-offset-2"
              >
                Read full methodology
              </Link>
              <Link
                href="/about"
                onClick={() => setIsAboutOpen(false)}
                className="inline-flex items-center gap-1 text-sm text-amber-700 hover:text-amber-800"
              >
                Full about page <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-semibold text-stone-900 dark:text-amber-100">{total}</span>
              <span className="text-sm text-stone-500 dark:text-slate-400">figures</span>
            </div>
            <div className="h-4 w-px bg-stone-300 dark:bg-slate-600 hidden sm:block" />
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-semibold text-stone-900 dark:text-amber-100">{totalModels || '–'}</span>
              <span className="text-sm text-stone-500 dark:text-slate-400">LLM models</span>
            </div>
            <div className="h-4 w-px bg-stone-300 dark:bg-slate-600 hidden sm:block" />
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-semibold text-stone-900 dark:text-amber-100">{totalLists || '–'}</span>
              <span className="text-sm text-stone-500 dark:text-slate-400">ranked lists</span>
            </div>
          </div>

          <details className="group">
            <summary className="cursor-pointer list-none text-lg text-stone-600 dark:text-slate-300 hover:text-stone-900 dark:hover:text-amber-200 transition-colors">
              <span className="inline-flex items-center gap-2">
                Combining academic rankings, Wikipedia metrics, and AI assessments to create both an educational resource and a new approach to "AI scrutability" by revealing how language models assess and explain the significance of human history.
                <svg
                  className="w-4 h-4 text-stone-400 dark:text-slate-500 group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </summary>
            <div className="mt-3 p-4 rounded-lg bg-white/60 dark:bg-slate-800/60 border border-stone-200/60 dark:border-amber-900/30 text-sm text-stone-600 dark:text-slate-300 leading-relaxed space-y-3">
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
        <div className="mb-6">
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
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : figures.length === 0 ? (
          <div className="text-center py-12 text-stone-500">
            No figures found matching your filters.
          </div>
        ) : (
          <>
            <RankingsTable
              figures={figures.slice(0, displayLimit)}
              onSelectFigure={handleSelectFigure}
              selectedId={selectedId}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
            />
            {figures.length > displayLimit && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => setDisplayLimit(prev => prev + PAGE_SIZE)}
                  className="px-8"
                >
                  Load more ({figures.length - displayLimit} remaining)
                </Button>
              </div>
            )}
            {figures.length > 0 && (
              <div className="mt-3 text-center text-sm text-stone-500 dark:text-slate-400">
                Showing {Math.min(displayLimit, figures.length)} of {figures.length} figures
              </div>
            )}
          </>
        )}

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

      {/* Detail Panel */}
      <FigureDetailPanel
        figure={selectedFigure}
        previewRow={selectedRow}
        rankings={selectedRankings}
        aliases={selectedAliases}
        isOpen={selectedId !== null}
        onClose={() => setSelectedId(null)}
        isLoading={isDetailLoading}
        llmRank={selectedLlmRank}
      />
    </main>
  );
}
