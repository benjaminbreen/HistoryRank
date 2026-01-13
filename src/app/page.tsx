'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { RankingsTable } from '@/components/rankings/RankingsTable';
import { RankingsFilters } from '@/components/rankings/RankingsFilters';
import { FigureDetailPanel } from '@/components/detail/FigureDetailPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ScatterChart } from 'lucide-react';
import type { FigureRow, Figure, Ranking, FiguresResponse, FigureDetailResponse } from '@/types';

export default function Home() {
  // State
  const [figures, setFigures] = useState<FigureRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState<string | null>(null);
  const [era, setEra] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('llmRank');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLlmRank, setSelectedLlmRank] = useState<number | null>(null);
  const [selectedFigure, setSelectedFigure] = useState<Figure | null>(null);
  const [selectedRankings, setSelectedRankings] = useState<Ranking[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Handle figure selection - store both id and llmRank
  const handleSelectFigure = (id: string) => {
    const figure = figures.find(f => f.id === id);
    setSelectedId(id);
    setSelectedLlmRank(figure?.llmRank || null);
  };

  // Fetch figures
  const fetchFigures = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (domain) params.set('domain', domain);
      if (era) params.set('era', era);
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
      params.set('limit', '1000'); // Get all for now

      const res = await fetch(`/api/figures?${params}`);
      const data: FiguresResponse = await res.json();

      setFigures(data.figures);
      setTotal(data.total);
    } catch (error) {
      console.error('Failed to fetch figures:', error);
    } finally {
      setIsLoading(false);
    }
  }, [search, domain, era, sortBy, sortOrder]);

  // Fetch on mount and when filters change
  useEffect(() => {
    const debounce = setTimeout(fetchFigures, 300);
    return () => clearTimeout(debounce);
  }, [fetchFigures]);

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
        const data: FigureDetailResponse = await res.json();
        setSelectedFigure(data.figure);
        setSelectedRankings(data.rankings);
      } catch (error) {
        console.error('Failed to fetch figure detail:', error);
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

  return (
    <main className="min-h-screen bg-[#faf9f7]">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-serif font-semibold text-stone-900">
                HistoryRank
              </h1>
              <p className="mt-1 text-stone-600">
                Comparing historical importance across academic rankings, Wikipedia attention, and AI assessments
              </p>
            </div>
            <Link href="/scatter">
              <Button variant="outline" className="gap-2">
                <ScatterChart className="h-4 w-4" />
                Scatter Plot
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats bar */}
        <div className="mb-6 flex items-center gap-6 text-sm text-stone-600">
          <span>
            <span className="font-mono font-medium text-stone-900">{total}</span> figures
          </span>
          <span className="text-stone-300">|</span>
          <span>
            Data: MIT Pantheon, Wikipedia, Claude, Gemini
          </span>
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
          <RankingsTable
            figures={figures}
            onSelectFigure={handleSelectFigure}
            selectedId={selectedId}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
        )}

        {/* Legend */}
        <div className="mt-6 p-4 bg-white rounded-lg border border-stone-200">
          <h3 className="text-sm font-medium text-stone-700 mb-2">Legend</h3>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-stone-600">
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
        rankings={selectedRankings}
        isOpen={selectedId !== null}
        onClose={() => setSelectedId(null)}
        isLoading={isDetailLoading}
        llmRank={selectedLlmRank}
      />
    </main>
  );
}
