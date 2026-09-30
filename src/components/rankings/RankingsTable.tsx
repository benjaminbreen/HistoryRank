'use client';

import { memo, useCallback, useState, useRef, useEffect, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import { Tooltip } from '@/components/ui/tooltip';
import { scrollBehavior } from '@/lib/utils/motion';
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

const formatNumber = (n: number | null) => {
  if (n === null) return '—';
  if (n >= 999500) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
};

const formatRank = (n: number | null) => {
  if (n === null) return '—';
  return `#${Math.round(n)}`;
};

const rowDomId = (figureId: string) => `figure-row-${figureId}`;

// Let the browser handle ctrl/cmd/shift-click (open in new tab/window) on the name link
const isModifiedClick = (event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }) =>
  event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

interface SortHeaderProps {
  column: string;
  children: React.ReactNode;
  tooltip?: string;
  align?: 'left' | 'center' | 'right';
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
}

// Module-level so it keeps its identity across renders (a component defined inside
// the table remounted on every scroll frame and dropped keyboard focus).
function SortHeader({ column, children, tooltip, align, sortBy, sortOrder, onSort }: SortHeaderProps) {
  return (
    <Tooltip content={tooltip || columnTooltips[column as keyof typeof columnTooltips]} align={align}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="flex items-center gap-1 rounded-sm hover:text-stone-900 dark:hover:text-stone-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70"
      >
        {children}
        {sortBy === column ? (
          sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />
        ) : (
          <span className="flex flex-col leading-none text-stone-400/70 dark:text-slate-500/80" aria-hidden="true">
            <ChevronUp className="h-2.5 w-2.5 -mb-1" />
            <ChevronDown className="h-2.5 w-2.5" />
          </span>
        )}
      </button>
    </Tooltip>
  );
}

interface MemoizedTableRowProps {
  figure: FigureRow;
  rowIndex: number;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: (id: string, index: number, source: 'click' | 'pointer') => void;
  onHover?: (id: string) => void;
  registerRow: (index: number, el: HTMLTableRowElement | null) => void;
  rowPadding: string;
  secondaryText: string;
  nameText: string;
  thumbnailSize: number;
  showRegion: boolean;
  showEra: boolean;
  showVariance: boolean;
  showViews: boolean;
}

const MemoizedTableRow = memo(function MemoizedTableRow({
  figure,
  rowIndex,
  isSelected,
  isFocused,
  onSelect,
  onHover,
  registerRow,
  rowPadding,
  secondaryText,
  nameText,
  thumbnailSize,
  showRegion,
  showEra,
  showVariance,
  showViews,
}: MemoizedTableRowProps) {
  return (
    <TableRow
      ref={(el) => registerRow(rowIndex, el)}
      id={rowDomId(figure.id)}
      data-figure-id={figure.id}
      data-row-even={rowIndex % 2 === 1 ? '' : undefined}
      onClick={(event) => {
        if (isModifiedClick(event)) return;
        onSelect(figure.id, rowIndex, 'click');
      }}
      onMouseDown={(event) => {
        if (event.button !== 0 || isModifiedClick(event)) return;
        onSelect(figure.id, rowIndex, 'pointer');
      }}
      onMouseEnter={() => onHover?.(figure.id)}
      className={`hr-table-row group/row cursor-pointer transition-colors ${
        isSelected
          ? 'bg-amber-100/70 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 border-l-4 border-l-amber-500 dark:border-l-amber-400'
          : 'hover:bg-white dark:hover:bg-slate-800/80 border-l-4 border-l-transparent'
      } ${isFocused ? 'outline-2 -outline-offset-2 outline-amber-500 dark:outline-amber-400' : ''}`}
      aria-selected={isSelected}
    >
      <TableCell className={`font-mono text-sm sm:text-base text-stone-900 dark:text-amber-100 font-medium whitespace-nowrap ${rowPadding}`}>
        {figure.llmRank ? `#${figure.llmRank}` : '—'}
      </TableCell>
      <TableCell className={`hidden sm:table-cell font-mono text-base text-stone-500 dark:text-slate-400 whitespace-nowrap ${rowPadding}`}>
        {formatRank(figure.hpiRank)}
      </TableCell>
      <TableCell className={rowPadding}>
        <div className="flex items-center gap-2 sm:gap-3">
          <FigureThumbnail
            figureId={figure.id}
            wikipediaSlug={figure.wikipediaSlug}
            name={figure.name}
            decorative
            size={thumbnailSize}
            className="group-hover/row:scale-110 group-hover/row:shadow-md flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
              {/* A real link so middle-click, open-in-new-tab and screen readers work; plain clicks open the panel */}
              <Link
                href={`/figure/${figure.id}`}
                prefetch={false}
                tabIndex={-1}
                onClick={(event) => {
                  if (!isModifiedClick(event)) event.preventDefault();
                }}
                className={`font-medium ${nameText} text-stone-900 dark:text-slate-100 line-clamp-2 sm:line-clamp-none rounded-sm outline-none hover:underline decoration-stone-400/60 underline-offset-2 focus-visible:underline`}
              >
                {figure.name}
              </Link>
              {figure.badges && figure.badges.length > 0 && (
                <span className="hidden md:inline-flex">
                  <BadgeDisplay badges={figure.badges} compact maxVisible={2} />
                </span>
              )}
            </div>
            {figure.birthYear && (
              <div className={`${secondaryText} text-stone-500 dark:text-slate-400`}>
                {figure.birthYear < 0 ? `${Math.abs(figure.birthYear)} BCE` : figure.birthYear}
                <span className="md:hidden">{figure.domain ? ` · ${figure.domain}` : ''}</span>
              </div>
            )}
          </div>
        </div>
      </TableCell>
      {showRegion && (
        <TableCell className={`hidden lg:table-cell ${secondaryText} text-stone-600 dark:text-slate-400 whitespace-nowrap ${rowPadding}`}>
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
      <TableCell className={`hidden md:table-cell text-sm text-stone-600 dark:text-slate-300 whitespace-nowrap ${rowPadding}`}>
        {figure.domain || '—'}
      </TableCell>
      {showEra && (
        <TableCell className={`hidden lg:table-cell text-sm text-stone-600 dark:text-slate-300 whitespace-nowrap ${rowPadding}`}>
          {figure.era || '—'}
        </TableCell>
      )}
      {showVariance && (
        <TableCell className={`hidden xl:table-cell whitespace-nowrap ${rowPadding}`}>
          <VarianceBadge level={getVarianceLevel(figure.varianceScore)} score={figure.varianceScore} />
        </TableCell>
      )}
      {showViews && (
        <TableCell className={`font-mono text-xs sm:text-sm text-right text-stone-500 dark:text-slate-400 whitespace-nowrap ${rowPadding}`}>
          {formatNumber(figure.pageviews)}
        </TableCell>
      )}
    </TableRow>
  );
});

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
  const baseRowHeight = density === 'compact' ? 44 : 56;
  const rowHeight = Math.round(baseRowHeight * fontScale);
  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [isTableFocused, setIsTableFocused] = useState(false);
  // Only draw the focused-row ring after keyboard navigation, not after a mouse click
  const [showFocusRing, setShowFocusRing] = useState(false);
  const [renderRange, setRenderRange] = useState({ start: 0, end: Math.min(figures.length, 40) });
  const tableRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const pendingFocusIndex = useRef<number | null>(null);
  const mouseDownSelection = useRef<string | null>(null);

  // Reset focus when figures change (e.g., filtering)
  useEffect(() => {
    if (focusedIndex >= figures.length) {
      setIsTableFocused(false);
      setFocusedIndex(figures.length > 0 ? 0 : -1);
    }
  }, [figures.length, focusedIndex]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusedIndex >= 0 && isTableFocused) {
      const row = rowRefs.current.get(focusedIndex);
      if (row) {
        row.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
        return;
      }
      if (!tableRef.current) return;
      const containerTop = tableRef.current.getBoundingClientRect().top + window.scrollY;
      const targetTop = containerTop + (focusedIndex * rowHeight);
      window.scrollTo({ top: targetTop, behavior: scrollBehavior() });
    }
  }, [focusedIndex, isTableFocused, rowHeight]);

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
      setShowFocusRing(true);
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

  // Memoized row component to prevent unnecessary re-renders
  const rowPadding = density === 'compact' ? 'py-1.5 sm:py-2' : 'py-2 sm:py-3';
  const secondaryText = density === 'compact' ? 'text-xs' : 'text-sm';
  const nameText = density === 'compact' ? 'text-sm' : 'text-base';

  // Stable callback for row clicks/pointer down
  const handleRowSelect = useCallback((id: string, index: number, source: 'click' | 'pointer') => {
    if (source === 'click' && mouseDownSelection.current === id) {
      mouseDownSelection.current = null;
      return;
    }
    if (source === 'pointer') {
      mouseDownSelection.current = id;
      pendingFocusIndex.current = index;
    }
    setIsTableFocused(true);
    setShowFocusRing(false);
    setFocusedIndex(index);
    onSelectFigure(id);
  }, [onSelectFigure]);

  const updateRenderRange = useCallback(() => {
    if (!tableRef.current) return;
    if (!Number.isFinite(rowHeight) || rowHeight <= 0) return;
    const rect = tableRef.current.getBoundingClientRect();
    const containerTop = rect.top + window.scrollY;
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;
    const scrollTop = Math.max(0, viewportTop - containerTop);
    const visibleHeight = Math.max(0, viewportBottom - containerTop);
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 8);
    const end = Math.min(
      figures.length,
      Math.ceil((scrollTop + visibleHeight) / rowHeight) + 12
    );
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    setRenderRange((prev) => {
      if (prev.start === start && prev.end === end) return prev;
      return { start, end };
    });
  }, [figures.length, rowHeight]);

  useEffect(() => {
    updateRenderRange();
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        updateRenderRange();
        ticking = false;
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [updateRenderRange]);

  const totalRowCount = figures.length;
  const startIndex = renderRange.start;
  const endIndex = Math.max(renderRange.end, startIndex);
  const visibleRows = useMemo(() => figures.slice(startIndex, endIndex), [figures, startIndex, endIndex]);
  const topSpacerHeight = startIndex * rowHeight;
  const bottomSpacerHeight = Math.max(0, (totalRowCount - endIndex) * rowHeight);
  const ariaSort = (column: string): 'ascending' | 'descending' | 'none' =>
    sortBy === column ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none';
  const columnCount =
    4 +
    (visibleColumns.region ? 1 : 0) +
    (visibleColumns.era ? 1 : 0) +
    (visibleColumns.variance ? 1 : 0) +
    (visibleColumns.views ? 1 : 0);

  return (
    <div className="relative group">
      <div
        ref={tableRef}
        tabIndex={0}
        role="grid"
        aria-label="Historical figures rankings"
        aria-rowcount={figures.length}
        aria-activedescendant={
          isTableFocused && focusedIndex >= 0 && focusedIndex < figures.length
            ? rowDomId(figures[focusedIndex].id)
            : undefined
        }
        data-rankings-grid=""
        onKeyDown={handleKeyDown}
        onFocus={handleTableFocus}
        onBlur={handleTableBlur}
        className="font-scale-root border border-stone-200 dark:border-slate-700/60 rounded-lg overflow-clip [&_[data-slot=table-container]]:overflow-x-clip focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
        style={{ '--fs': fontScale } as React.CSSProperties}
      >
      <Table>
        <TableHeader className="border-t border-stone-200/70 dark:border-slate-700/50 sticky top-[var(--app-header-height,56px)] z-20">
          <TableRow className="bg-stone-50 dark:bg-slate-800/80 hover:bg-stone-50 dark:hover:bg-slate-800/80">
            <TableHead aria-sort={ariaSort('llmRank')} className="w-[46px] sm:w-[60px] text-stone-600 dark:text-slate-400 font-medium">
              <SortHeader sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} column="llmRank">LLM</SortHeader>
            </TableHead>
            <TableHead aria-sort={ariaSort('hpiRank')} className="hidden sm:table-cell w-[60px] text-stone-600 dark:text-slate-400 font-medium">
              <SortHeader sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} column="hpiRank">HPI</SortHeader>
            </TableHead>
            <TableHead aria-sort={ariaSort('name')} className="text-stone-600 dark:text-slate-400 font-medium">
              <SortHeader sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} column="name">Name</SortHeader>
            </TableHead>
            {visibleColumns.region && (
              <TableHead aria-sort={ariaSort('regionSub')} className="hidden lg:table-cell w-[140px] text-stone-600 dark:text-slate-400 font-medium">
                <SortHeader sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} column="regionSub">Region</SortHeader>
              </TableHead>
            )}
            <TableHead aria-sort={ariaSort('domain')} className="hidden md:table-cell w-[100px] text-stone-600 dark:text-slate-400 font-medium">
              <SortHeader sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} column="domain">Domain</SortHeader>
            </TableHead>
            {visibleColumns.era && (
              <TableHead aria-sort={ariaSort('era')} className="hidden lg:table-cell w-[100px] text-stone-600 dark:text-slate-400 font-medium">
                <SortHeader sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} column="era">Era</SortHeader>
              </TableHead>
            )}
            {visibleColumns.variance && (
              <TableHead aria-sort={ariaSort('varianceScore')} className="hidden xl:table-cell w-[110px] text-stone-600 dark:text-slate-400 font-medium">
                <SortHeader sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} column="varianceScore" align="right">Variance</SortHeader>
              </TableHead>
            )}
            {visibleColumns.views && (
              <TableHead aria-sort={ariaSort('pageviews')} className="w-[58px] sm:w-[90px] text-stone-600 dark:text-slate-400 font-medium text-right">
                <SortHeader sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} column="pageviews" align="right">Views</SortHeader>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody role="rowgroup">
          {figures.length === 0 && (
            <TableRow>
              <TableCell colSpan={columnCount} className="text-center py-12">
                <div className="text-stone-400 dark:text-slate-500">
                  <p className="text-sm font-medium">No figures match your filters</p>
                  <p className="text-xs mt-1">Try adjusting your search or filter criteria</p>
                </div>
              </TableCell>
            </TableRow>
          )}
          {topSpacerHeight > 0 && (
            <TableRow aria-hidden="true">
              <TableCell colSpan={columnCount} style={{ height: topSpacerHeight, padding: 0 }} />
            </TableRow>
          )}
          {visibleRows.map((figure, offset) => {
            const index = startIndex + offset;
            return (
            <MemoizedTableRow
              key={figure.id}
              figure={figure}
              rowIndex={index}
              isSelected={selectedId === figure.id}
              isFocused={showFocusRing && isTableFocused && focusedIndex === index}
              onSelect={handleRowSelect}
              onHover={onPrefetch}
              registerRow={setRowRef}
              rowPadding={rowPadding}
              secondaryText={secondaryText}
              nameText={nameText}
              thumbnailSize={thumbnailSize}
              showRegion={visibleColumns.region}
              showEra={visibleColumns.era}
              showVariance={visibleColumns.variance}
              showViews={visibleColumns.views}
            />
          );
          })}
          {bottomSpacerHeight > 0 && (
            <TableRow aria-hidden="true">
              <TableCell colSpan={columnCount} style={{ height: bottomSpacerHeight, padding: 0 }} />
            </TableRow>
          )}
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
