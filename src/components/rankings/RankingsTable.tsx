'use client';

import { memo, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { VarianceBadge } from './VarianceBadge';
import { FigureThumbnail } from './FigureThumbnail';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { REGION_COLORS } from '@/types';
import type { FigureRow } from '@/types';

interface RankingsTableProps {
  figures: FigureRow[];
  onSelectFigure: (id: string) => void;
  selectedId?: string | null;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
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
  selectedId,
  sortBy,
  sortOrder,
  onSort,
}: RankingsTableProps) {
  const SortHeader = ({ column, children, tooltip }: { column: string; children: React.ReactNode; tooltip?: string }) => (
    <button
      onClick={() => onSort(column)}
      className="flex items-center gap-1 hover:text-stone-900 dark:hover:text-stone-100 transition-colors cursor-help"
      title={tooltip || columnTooltips[column as keyof typeof columnTooltips]}
    >
      {children}
      {sortBy === column && (
        sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
      )}
    </button>
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
  const MemoizedTableRow = memo(function MemoizedTableRow({
    figure,
    isSelected,
    onSelect,
  }: {
    figure: FigureRow;
    isSelected: boolean;
    onSelect: (id: string) => void;
  }) {
    return (
      <TableRow
        key={figure.id}
        data-figure-id={figure.id}
        onClick={() => onSelect(figure.id)}
        className={`hr-table-row group cursor-pointer transition-colors ${
          isSelected
            ? 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30'
            : 'hover:bg-white dark:hover:bg-slate-800/80'
        }`}
      >
        <TableCell className="font-mono text-base text-stone-900 dark:text-amber-100 font-medium py-3">
          {figure.llmRank ? `#${figure.llmRank}` : '—'}
        </TableCell>
        <TableCell className="font-mono text-base text-stone-500 dark:text-slate-400 py-3">
          {formatRank(figure.hpiRank)}
        </TableCell>
        <TableCell className="py-3">
          <div className="flex items-center gap-3">
            <FigureThumbnail
              figureId={figure.id}
              wikipediaSlug={figure.wikipediaSlug}
              name={figure.name}
              size={38}
              className="group-hover:scale-105"
            />
            <div>
              <div className="font-medium text-[15px] text-stone-900 dark:text-slate-100">{figure.name}</div>
              {figure.birthYear && (
                <div className="text-sm text-stone-400 dark:text-slate-500">
                  {figure.birthYear < 0 ? `${Math.abs(figure.birthYear)} BCE` : figure.birthYear}
                </div>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className="text-sm text-stone-600 dark:text-slate-400 py-3">
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
        <TableCell className="text-[15px] text-stone-600 dark:text-slate-300 py-3">
          {figure.domain || '—'}
        </TableCell>
        <TableCell className="text-[15px] text-stone-600 dark:text-slate-300 py-3">
          {figure.era || '—'}
        </TableCell>
        <TableCell className="py-3">
          <VarianceBadge level={figure.varianceLevel} score={figure.varianceScore} />
        </TableCell>
        <TableCell className="font-mono text-base text-right text-stone-500 dark:text-slate-400 py-3">
          {formatNumber(figure.pageviews)}
        </TableCell>
      </TableRow>
    );
  });

  // Stable callback for row clicks
  const handleRowClick = useCallback((id: string) => {
    onSelectFigure(id);
  }, [onSelectFigure]);

  return (
    <div className="border border-stone-200 dark:border-amber-900/30 rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-stone-50 dark:bg-slate-800/80 hover:bg-stone-50 dark:hover:bg-slate-800/80">
            <TableHead className="w-[60px] text-stone-600 dark:text-slate-400 font-medium">
              <SortHeader column="llmRank">LLM</SortHeader>
            </TableHead>
            <TableHead className="w-[60px] text-stone-600 dark:text-slate-400 font-medium">
              <SortHeader column="hpiRank">HPI</SortHeader>
            </TableHead>
            <TableHead className="text-stone-600 dark:text-slate-400 font-medium">
              <SortHeader column="name">Name</SortHeader>
            </TableHead>
            <TableHead className="w-[140px] text-stone-600 dark:text-slate-400 font-medium">
              <SortHeader column="regionSub">Region</SortHeader>
            </TableHead>
            <TableHead
              className="w-[100px] text-stone-600 dark:text-slate-400 font-medium cursor-help"
              title={columnTooltips.domain}
            >
              Domain
            </TableHead>
            <TableHead
              className="w-[100px] text-stone-600 dark:text-slate-400 font-medium cursor-help"
              title={columnTooltips.era}
            >
              Era
            </TableHead>
            <TableHead className="w-[110px] text-stone-600 dark:text-slate-400 font-medium">
              <SortHeader column="varianceScore">Variance</SortHeader>
            </TableHead>
            <TableHead className="w-[90px] text-stone-600 dark:text-slate-400 font-medium text-right">
              <SortHeader column="pageviews">Views</SortHeader>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {figures.map((figure) => (
            <MemoizedTableRow
              key={figure.id}
              figure={figure}
              isSelected={selectedId === figure.id}
              onSelect={handleRowClick}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
