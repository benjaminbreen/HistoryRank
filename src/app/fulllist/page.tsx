'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { FigureDetailPanel } from '@/components/detail/FigureDetailPanel';
import { useSettings } from '@/hooks/useSettings';
import { Search } from 'lucide-react';
import type { Figure, Ranking, FigureDetailResponse } from '@/types';

type MiniFigure = {
  id: string;
  name: string;
  domain: string | null;
  era: string | null;
  birthYear: number | null;
  deathYear: number | null;
  rank: number | null;
};

type GroupMode = 'alphabet' | 'era';

const ERA_ORDER = [
  'Ancient',
  'Classical',
  'Late Antiquity',
  'Medieval',
  'Early Modern',
  'Industrial',
  'Modern',
  'Contemporary',
];

const DOMAIN_COLORS: Record<string, string> = {
  'Science': '#3b82f6',
  'Arts': '#a855f7',
  'Politics': '#ef4444',
  'Religion': '#f59e0b',
  'Military': '#64748b',
  'Philosophy': '#06b6d4',
  'Sports': '#22c55e',
  'Business': '#78716c',
  'Exploration': '#0ea5e9',
};

function formatYears(birth: number | null, death: number | null): string {
  if (!birth && !death) return '';
  if (birth && !death) return `b. ${birth}`;
  if (!birth && death) return `d. ${death}`;
  return `${birth}–${death}`;
}

export default function FullListPage() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [figures, setFigures] = useState<MiniFigure[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [groupMode, setGroupMode] = useState<GroupMode>('alphabet');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Detail panel state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFigure, setSelectedFigure] = useState<Figure | null>(null);
  const [selectedRankings, setSelectedRankings] = useState<Ranking[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchFigures = async () => {
      try {
        const res = await fetch('/api/figures/all');
        if (!res.ok) return;
        const data = await res.json();
        setFigures(data.figures || []);
      } catch (error) {
        console.error('Failed to fetch figures:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchFigures();
  }, []);

  // Fetch detail when selected
  useEffect(() => {
    if (!selectedId) {
      setSelectedFigure(null);
      setSelectedRankings([]);
      return;
    }

    const fetchDetail = async () => {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/figures/${selectedId}`);
        if (!res.ok) return;
        const data: FigureDetailResponse = await res.json();
        setSelectedFigure(data?.figure ?? null);
        setSelectedRankings(Array.isArray(data?.rankings) ? data.rankings : []);
      } catch (error) {
        console.error('Failed to fetch figure detail:', error);
      } finally {
        setDetailLoading(false);
      }
    };
    fetchDetail();
  }, [selectedId]);

  const filteredFigures = useMemo(() => {
    if (!search.trim()) return figures;
    const term = search.toLowerCase();
    return figures.filter(f => f.name.toLowerCase().includes(term));
  }, [figures, search]);

  const groupedFigures = useMemo(() => {
    const groups = new Map<string, MiniFigure[]>();

    if (groupMode === 'alphabet') {
      for (const fig of filteredFigures) {
        const letter = (fig.name[0] || '#').toUpperCase();
        if (!groups.has(letter)) groups.set(letter, []);
        groups.get(letter)!.push(fig);
      }
      // Sort alphabetically
      return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    } else {
      // Group by era
      for (const fig of filteredFigures) {
        const era = fig.era || 'Unknown';
        if (!groups.has(era)) groups.set(era, []);
        groups.get(era)!.push(fig);
      }
      // Sort by era order
      return Array.from(groups.entries()).sort((a, b) => {
        const aIdx = ERA_ORDER.indexOf(a[0]);
        const bIdx = ERA_ORDER.indexOf(b[0]);
        if (aIdx === -1 && bIdx === -1) return a[0].localeCompare(b[0]);
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      });
    }
  }, [filteredFigures, groupMode]);

  const alphabetLinks = useMemo(() => {
    if (groupMode !== 'alphabet') return [];
    const letters = new Set(filteredFigures.map(f => (f.name[0] || '#').toUpperCase()));
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(l => letters.has(l));
  }, [filteredFigures, groupMode]);

  const handleMouseMove = (e: React.MouseEvent, fig: MiniFigure) => {
    setHoveredId(fig.id);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const hoveredFigure = figures.find(f => f.id === hoveredId);

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-slate-900">
      <AppHeader
        active="table"
        settings={settings}
        onSettingsChange={updateSettings}
        onSettingsReset={resetSettings}
      />

      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-light tracking-tight text-stone-900 dark:text-amber-100">
            Complete Index
          </h1>
          <p className="text-sm text-stone-500 dark:text-slate-400 mt-1">
            {figures.length.toLocaleString()} historical figures
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 mb-6 pb-6 border-b border-stone-200 dark:border-slate-700">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search names..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-amber-500 focus:border-transparent placeholder:text-stone-400 dark:placeholder:text-slate-500"
            />
          </div>

          {/* Group toggle */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-stone-400 dark:text-slate-500 mr-2">Group by:</span>
            <button
              onClick={() => setGroupMode('alphabet')}
              className={`px-3 py-1.5 rounded transition-colors ${
                groupMode === 'alphabet'
                  ? 'bg-stone-900 dark:bg-amber-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-stone-600 dark:text-slate-300 border border-stone-200 dark:border-slate-600 hover:border-stone-300 dark:hover:border-slate-500'
              }`}
            >
              A–Z
            </button>
            <button
              onClick={() => setGroupMode('era')}
              className={`px-3 py-1.5 rounded transition-colors ${
                groupMode === 'era'
                  ? 'bg-stone-900 dark:bg-amber-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-stone-600 dark:text-slate-300 border border-stone-200 dark:border-slate-600 hover:border-stone-300 dark:hover:border-slate-500'
              }`}
            >
              Era
            </button>
          </div>

          {/* Alphabet jump links */}
          {groupMode === 'alphabet' && alphabetLinks.length > 0 && (
            <div className="flex flex-wrap gap-1 text-xs font-mono">
              {alphabetLinks.map(letter => (
                <a
                  key={letter}
                  href={`#section-${letter}`}
                  className="w-6 h-6 flex items-center justify-center text-stone-400 dark:text-slate-500 hover:text-stone-900 dark:hover:text-amber-300 hover:bg-stone-100 dark:hover:bg-slate-800 rounded transition-colors"
                >
                  {letter}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="text-center py-20 text-stone-400 dark:text-slate-500">
            Loading {figures.length > 0 ? figures.length.toLocaleString() : ''} figures...
          </div>
        )}

        {/* Figure list */}
        {!loading && (
          <div ref={containerRef} className="space-y-8">
            {groupedFigures.map(([group, figs]) => (
              <section key={group} id={`section-${group}`}>
                {/* Group header */}
                <div className="sticky top-0 z-10 bg-[#fafafa] dark:bg-slate-900 py-2 mb-3 border-b border-stone-200 dark:border-slate-700">
                  <h2 className="text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-slate-500">
                    {group}
                    <span className="ml-2 text-stone-300 dark:text-slate-600 font-normal">
                      {figs.length}
                    </span>
                  </h2>
                </div>

                {/* Names grid */}
                <div className="flex flex-wrap gap-x-1 gap-y-0.5 leading-tight">
                  {figs.map((fig) => (
                    <button
                      key={fig.id}
                      onClick={() => setSelectedId(fig.id)}
                      onMouseMove={(e) => handleMouseMove(e, fig)}
                      onMouseLeave={() => setHoveredId(null)}
                      className="text-[11px] text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200 transition-colors whitespace-nowrap"
                      style={{
                        color: hoveredId === fig.id && fig.domain
                          ? DOMAIN_COLORS[fig.domain] || undefined
                          : undefined,
                        fontWeight: hoveredId === fig.id ? 500 : 400,
                      }}
                    >
                      {fig.name}
                      {fig !== figs[figs.length - 1] && (
                        <span className="text-stone-300 dark:text-slate-600 mx-1">·</span>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Results count when searching */}
        {search && !loading && (
          <div className="mt-8 pt-4 border-t border-stone-200 dark:border-slate-700 text-xs text-stone-400 dark:text-slate-500">
            {filteredFigures.length === 0
              ? 'No matches found'
              : `${filteredFigures.length} match${filteredFigures.length === 1 ? '' : 'es'}`}
          </div>
        )}
      </main>

      {/* Hover tooltip */}
      {hoveredFigure && (
        <div
          className="fixed z-50 pointer-events-none bg-stone-900 dark:bg-slate-800 text-white px-3 py-2 rounded-lg shadow-xl text-xs max-w-[200px] dark:ring-1 dark:ring-slate-700"
          style={{
            left: tooltipPos.x + 12,
            top: tooltipPos.y + 12,
          }}
        >
          <div className="font-medium">{hoveredFigure.name}</div>
          <div className="text-stone-400 dark:text-slate-400 mt-0.5">
            {formatYears(hoveredFigure.birthYear, hoveredFigure.deathYear)}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[10px]">
            {hoveredFigure.domain && (
              <span
                className="px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: DOMAIN_COLORS[hoveredFigure.domain] + '20',
                  color: DOMAIN_COLORS[hoveredFigure.domain],
                }}
              >
                {hoveredFigure.domain}
              </span>
            )}
            {hoveredFigure.rank && (
              <span className="text-stone-400 dark:text-slate-500">
                Rank #{Math.round(hoveredFigure.rank)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Detail Panel */}
      <FigureDetailPanel
        figure={selectedFigure}
        rankings={selectedRankings}
        isOpen={selectedId !== null}
        onClose={() => setSelectedId(null)}
        isLoading={detailLoading}
      />
    </div>
  );
}
