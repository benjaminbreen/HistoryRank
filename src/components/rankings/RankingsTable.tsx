'use client';

import { memo, useCallback, useState, useRef, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { VarianceBadge } from './VarianceBadge';
import { BadgeDisplay } from './BadgeDisplay';
import { FigureThumbnail } from './FigureThumbnail';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { REGION_COLORS, getVarianceLevel } from '@/types';
import type { FigureRow } from '@/types';

interface RankingsTableProps {
  figures: FigureRow[];
  onSelectFigure: (id: string) => void;
  onPrefetch?: (id: string) => void;
  selectedId?: string | null;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  density?: 'comfortable' | 'compact';
  thumbnailSize?: number;
  fontScale?: number;
  visibleColumns?: {
    region: boolean;
    era: boolean;
    variance: boolean;
    views: boolean;
  };
}

// Column tooltip descriptions
const columnTooltips = {
  llmRank: 'Position 1–535 based on LLM consensus — ranking by combined AI assessment across multiple models',
  hpiRank: 'MIT Pantheon Historical Popularity Index — academic assessment of historical importance based on Wikipedia language editions, biography length, and page views',
  name: 'Canonical name of the historical figure',
  domain: 'Primary field of activity (Science, Arts, Politics, Religion, Military, etc.)',
  regionSub: 'Geographic region based on birthplace (stable across eras)',
  era: 'Historical period (Ancient, Medieval, Early Modern, Modern, Contemporary)',
  llmConsensusRank: 'Average rank across AI models (Claude Sonnet 4.5, Gemini Flash 3, Gemini Pro 3) — AI assessment of historical importance',
  varianceScore: 'Disagreement between ranking sources — higher variance indicates more "controversial" figures where sources disagree on importance',
  pageviews: 'Wikipedia pageviews (2025) — measures current internet attention and public interest',
};

export function RankingsTable({
  figures,
  onSelectFigure,
  onPrefetch,
  selectedId,
  sortBy,
  sortOrder,
  onSort,
  density = 'comfortable',
  thumbnailSize = 38,
  fontScale = 1,
  visibleColumns = {
    region: true,
    era: true,
    variance: true,
    views: true,
  },
}: RankingsTableProps) {
  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [isTableFocused, setIsTableFocused] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const pendingFocusIndex = useRef<number | null>(null);

  // Reset focus when figures change (e.g., filtering)
  useEffect(() => {
    if (focusedIndex >= figures.length) {
      setFocusedIndex(figures.length > 0 ? 0 : -1);
    }
  }, [figures.length, focusedIndex]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusedIndex >= 0 && isTableFocused) {
      const row = rowRefs.current.get(focusedIndex);
      if (row) {
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [focusedIndex, isTableFocused]);

  // Keyboard event handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (figures.length === 0) return;

    const pageSize = 10;
    let newIndex = focusedIndex;
    let handled = true;

    switch (e.key) {
      case 'ArrowDown':
        newIndex = focusedIndex < figures.length - 1 ? focusedIndex + 1 : focusedIndex;
        break;
      case 'ArrowUp':
        newIndex = focusedIndex > 0 ? focusedIndex - 1 : 0;
        break;
      case 'Home':
        newIndex = 0;
        break;
      case 'End':
        newIndex = figures.length - 1;
        break;
      case 'PageDown':
        newIndex = Math.min(focusedIndex + pageSize, figures.length - 1);
        break;
      case 'PageUp':
        newIndex = Math.max(focusedIndex - pageSize, 0);
        break;
      case 'Enter':
      case ' ':
        if (focusedIndex >= 0 && focusedIndex < figures.length) {
          e.preventDefault();
          onSelectFigure(figures[focusedIndex].id);
        }
        return;
      case 'Escape':
        setFocusedIndex(-1);
        tableRef.current?.blur();
        return;
      default:
        handled = false;
    }

    if (handled) {
      e.preventDefault();
      if (newIndex !== focusedIndex) {
        setFocusedIndex(newIndex);
      }
    }
  }, [figures, focusedIndex, onSelectFigure]);

  // Handle table focus
  const handleTableFocus = useCallback(() => {
    setIsTableFocused(true);
    if (pendingFocusIndex.current !== null) {
      setFocusedIndex(pendingFocusIndex.current);
      pendingFocusIndex.current = null;
      return;
    }
    if (focusedIndex === -1 && figures.length > 0) {
      // Find the selected row or default to first
      const selectedIndex = figures.findIndex(f => f.id === selectedId);
      setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [focusedIndex, figures, selectedId]);

  const handleTableBlur = useCallback((e: React.FocusEvent) => {
    // Only blur if focus is leaving the table entirely
    if (!tableRef.current?.contains(e.relatedTarget as Node)) {
      setIsTableFocused(false);
    }
  }, []);

  // Register row ref
  const setRowRef = useCallback((index: number, el: HTMLTableRowElement | null) => {
    if (el) {
      rowRefs.current.set(index, el);
    } else {
      rowRefs.current.delete(index);
    }
  }, []);

  const SortHeader = ({ column, children, tooltip, align }: { column: string; children: React.ReactNode; tooltip?: string; align?: 'left' | 'center' | 'right' }) => (
    <Tooltip content={tooltip || columnTooltips[column as keyof typeof columnTooltips]} align={align}>
      <button
        onClick={() => onSort(column)}
        className="flex items-center gap-1 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
      >
        {children}
        {sortBy === column ? (
          sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
        ) : (
          <span className="flex flex-col leading-none text-stone-300 dark:text-slate-600">
            <ChevronUp className="h-2.5 w-2.5 -mb-1" />
            <ChevronDown className="h-2.5 w-2.5" />
          </span>
        )}
      </button>
    </Tooltip>
  );

  const formatNumber = (n: number | null) => {
    if (n === null) return '—';
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return n.toString();
  };

  const formatRank = (n: number | null) => {
    if (n === null) return '—';
    return `#${Math.round(n)}`;
  };

  // Memoized row component to prevent unnecessary re-renders
  const rowPadding = density === 'compact' ? 'py-2' : 'py-3';
  const secondaryText = density === 'compact' ? 'text-xs' : 'text-sm';
  const nameText = density === 'compact' ? 'text-[14px]' : 'text-[15px]';

  const MemoizedTableRow = memo(function MemoizedTableRow({
    figure,
    isSelected,
    onSelect,
    onHover,
    onPointerDown,
    rowRef,
  }: {
    figure: FigureRow;
    isSelected: boolean;
    onSelect: () => void;
    onHover?: (id: string) => void;
    onPointerDown?: () => void;
    rowRef: (el: HTMLTableRowElement | null) => void;
  }) {
    return (
      <TableRow
        ref={rowRef}
        data-figure-id={figure.id}
        onClick={onSelect}
        onMouseDown={onPointerDown}
        onMouseEnter={() => onHover?.(figure.id)}
        className={`hr-table-row group cursor-pointer transition-colors ${
          isSelected
            ? 'bg-amber-100/70 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 border-l-4 border-l-amber-500 dark:border-l-amber-400'
            : 'hover:bg-white dark:hover:bg-slate-800/80 border-l-4 border-l-transparent'
        }`}
        aria-selected={isSelected}
      >
        <TableCell className={`font-mono text-sm sm:text-base text-stone-900 dark:text-amber-100 font-medium ${rowPadding}`}>
          {figure.llmRank ? `#${figure.llmRank}` : '—'}
        </TableCell>
        <TableCell className={`hidden sm:table-cell font-mono text-base text-stone-500 dark:text-slate-400 ${rowPadding}`}>
          {formatRank(figure.hpiRank)}
        </TableCell>
        <TableCell className={rowPadding}>
          <div className="flex items-center gap-2 sm:gap-3">
            <FigureThumbnail
              figureId={figure.id}
              wikipediaSlug={figure.wikipediaSlug}
              name={figure.name}
              size={thumbnailSize}
              className="group-hover:scale-105 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                <span className={`font-medium ${nameText} text-stone-900 dark:text-slate-100 truncate sm:whitespace-normal`}>{figure.name}</span>
                {figure.badges && figure.badges.length > 0 && (
                  <BadgeDisplay badges={figure.badges} compact maxVisible={2} />
                )}
              </div>
              {figure.birthYear && (
                <div className={`${secondaryText} text-stone-400 dark:text-slate-500`}>
                  {figure.birthYear < 0 ? `${Math.abs(figure.birthYear)} BCE` : figure.birthYear}
                  {/* Show domain on mobile since column is hidden */}
                  <span className="md:hidden">{figure.domain ? ` · ${figure.domain}` : ''}</span>
                </div>
              )}
            </div>
          </div>
        </TableCell>
        {visibleColumns.region && (
          <TableCell className={`hidden lg:table-cell ${secondaryText} text-stone-600 dark:text-slate-400 ${rowPadding}`}>
            {figure.regionSub ? (
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white"
                style={{ backgroundColor: REGION_COLORS[figure.regionSub] || '#9ca3af' }}
              >
                {figure.regionSub}
              </span>
            ) : (
              '—'
            )}
          </TableCell>
        )}
        <TableCell className={`hidden md:table-cell text-[15px] text-stone-600 dark:text-slate-300 ${rowPadding}`}>
          {figure.domain || '—'}
        </TableCell>
        {visibleColumns.era && (
          <TableCell className={`hidden lg:table-cell text-[15px] text-stone-600 dark:text-slate-300 ${rowPadding}`}>
            {figure.era || '—'}
          </TableCell>
        )}
        {visibleColumns.variance && (
          <TableCell className={`hidden xl:table-cell ${rowPadding}`}>
            <VarianceBadge level={getVarianceLevel(figure.varianceScore)} score={figure.varianceScore} />
          </TableCell>
        )}
        {visibleColumns.views && (
          <TableCell className={`font-mono text-sm sm:text-base text-right text-stone-500 dark:text-slate-400 ${rowPadding}`}>
            {formatNumber(figure.pageviews)}
          </TableCell>
        )}
      </TableRow>
    );
  });

  // Stable callback for row clicks
  const handleRowClick = useCallback((id: string, index: number) => {
    setIsTableFocused(true);
    setFocusedIndex(index);
    onSelectFigure(id);
  }, [onSelectFigure]);

  return (
    <div className="relative group">
      <div
        ref={tableRef}
        tabIndex={0}
        role="grid"
        aria-label="Historical figures rankings"
        aria-rowcount={figures.length}
        onKeyDown={handleKeyDown}
        onFocus={handleTableFocus}
        onBlur={handleTableBlur}
        className="border border-stone-200 dark:border-amber-900/30 rounded-lg overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
        style={{ fontSize: `${fontScale}em` }}
      >
      <Table className="min-w-[600px]">
        <TableHeader className="border-t border-stone-200/70 dark:border-amber-900/40">
          <TableRow className="bg-stone-50 dark:bg-slate-800/80 hover:bg-stone-50 dark:hover:bg-slate-800/80">
            <TableHead className="w-[50px] sm:w-[60px] text-stone-600 dark:text-slate-400 font-medium">
              <SortHeader column="llmRank">LLM</SortHeader>
            </TableHead>
            <TableHead className="hidden sm:table-cell w-[60px] text-stone-600 dark:text-slate-400 font-medium">
              <SortHeader column="hpiRank">HPI</SortHeader>
            </TableHead>
            <TableHead className="text-stone-600 dark:text-slate-400 font-medium">
              <SortHeader column="name">Name</SortHeader>
            </TableHead>
            {visibleColumns.region && (
              <TableHead className="hidden lg:table-cell w-[140px] text-stone-600 dark:text-slate-400 font-medium">
                <SortHeader column="regionSub">Region</SortHeader>
              </TableHead>
            )}
            <TableHead className="hidden md:table-cell w-[100px] text-stone-700 dark:text-slate-300 font-medium">
              <SortHeader column="domain">Domain</SortHeader>
            </TableHead>
            {visibleColumns.era && (
              <TableHead className="hidden lg:table-cell w-[100px] text-stone-700 dark:text-slate-300 font-medium">
                <SortHeader column="era">Era</SortHeader>
              </TableHead>
            )}
            {visibleColumns.variance && (
              <TableHead className="hidden xl:table-cell w-[110px] text-stone-700 dark:text-slate-300 font-medium">
                <SortHeader column="varianceScore" align="right">Variance</SortHeader>
              </TableHead>
            )}
            {visibleColumns.views && (
              <TableHead className="w-[70px] sm:w-[90px] text-stone-700 dark:text-slate-300 font-medium text-right">
                <SortHeader column="pageviews" align="right">Views</SortHeader>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody role="rowgroup">
          {figures.map((figure, index) => (
            <MemoizedTableRow
              key={figure.id}
              figure={figure}
              isSelected={selectedId === figure.id}
              onSelect={() => handleRowClick(figure.id, index)}
              onHover={onPrefetch}
              onPointerDown={() => {
                pendingFocusIndex.current = index;
              }}
              rowRef={(el) => setRowRef(index, el)}
            />
          ))}
        </TableBody>
      </Table>
      </div>
      {/* Keyboard navigation hint - hidden on mobile, shown on focus or hover */}
      <div
        className={`hidden sm:flex items-center justify-center gap-2 mt-2 text-xs transition-opacity duration-200 ${
          isTableFocused
            ? 'opacity-100 text-stone-600 dark:text-slate-400'
            : 'opacity-0 group-hover:opacity-60 text-stone-400 dark:text-slate-500'
        }`}
        aria-hidden="true"
      >
        <kbd className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-slate-700 border border-stone-200 dark:border-slate-600 font-mono text-[10px]">↑↓</kbd>
        <span>navigate</span>
        <span className="text-stone-300 dark:text-slate-600">·</span>
        <kbd className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-slate-700 border border-stone-200 dark:border-slate-600 font-mono text-[10px]">Enter</kbd>
        <span>select</span>
        <span className="text-stone-300 dark:text-slate-600">·</span>
        <kbd className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-slate-700 border border-stone-200 dark:border-slate-600 font-mono text-[10px]">Esc</kbd>
        <span>exit</span>
      </div>
    </div>
  );
}
