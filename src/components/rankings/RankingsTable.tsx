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
        <TableCell className={`font-mono text-base text-stone-900 dark:text-amber-100 font-medium ${rowPadding}`}>
          {figure.llmRank ? `#${figure.llmRank}` : '—'}
        </TableCell>
        <TableCell className={`font-mono text-base text-stone-500 dark:text-slate-400 ${rowPadding}`}>
          {formatRank(figure.hpiRank)}
        </TableCell>
        <TableCell className={rowPadding}>
          <div className="flex items-center gap-3">
            <FigureThumbnail
              figureId={figure.id}
              wikipediaSlug={figure.wikipediaSlug}
              name={figure.name}
              size={thumbnailSize}
              className="group-hover:scale-105"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-medium ${nameText} text-stone-900 dark:text-slate-100`}>{figure.name}</span>
                {figure.badges && figure.badges.length > 0 && (
                  <BadgeDisplay badges={figure.badges} compact maxVisible={3} />
                )}
              </div>
              {figure.birthYear && (
                <div className={`${secondaryText} text-stone-400 dark:text-slate-500`}>
                  {figure.birthYear < 0 ? `${Math.abs(figure.birthYear)} BCE` : figure.birthYear}
                </div>
              )}
            </div>
          </div>
        </TableCell>
        {visibleColumns.region && (
          <TableCell className={`${secondaryText} text-stone-600 dark:text-slate-400 ${rowPadding}`}>
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
        <TableCell className={`text-[15px] text-stone-600 dark:text-slate-300 ${rowPadding}`}>
          {figure.domain || '—'}
        </TableCell>
        {visibleColumns.era && (
          <TableCell className={`text-[15px] text-stone-600 dark:text-slate-300 ${rowPadding}`}>
            {figure.era || '—'}
          </TableCell>
        )}
        {visibleColumns.variance && (
          <TableCell className={rowPadding}>
            <VarianceBadge level={getVarianceLevel(figure.varianceScore)} score={figure.varianceScore} />
          </TableCell>
        )}
        {visibleColumns.views && (
          <TableCell className={`font-mono text-base text-right text-stone-500 dark:text-slate-400 ${rowPadding}`}>
            {formatNumber(figure.pageviews)}
          </TableCell>
        )}
      </TableRow>
    );
  });

  // Stable callback for row clicks
  const handleRowClick = useCallback((id: string) => {
    onSelectFigure(id);
  }, [onSelectFigure]);

  return (
    <div
      className="border border-stone-200 dark:border-amber-900/30 rounded-lg overflow-hidden"
      style={{ fontSize: `${fontScale}em` }}
    >
      <Table>
        <TableHeader className="border-t border-stone-200/70 dark:border-amber-900/40">
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
            {visibleColumns.region && (
              <TableHead className="w-[140px] text-stone-600 dark:text-slate-400 font-medium">
                <SortHeader column="regionSub">Region</SortHeader>
              </TableHead>
            )}
            <TableHead className="w-[100px] text-stone-700 dark:text-slate-300 font-medium">
              <SortHeader column="domain">Domain</SortHeader>
            </TableHead>
            {visibleColumns.era && (
              <TableHead className="w-[100px] text-stone-700 dark:text-slate-300 font-medium">
                <SortHeader column="era">Era</SortHeader>
              </TableHead>
            )}
            {visibleColumns.variance && (
              <TableHead className="w-[110px] text-stone-700 dark:text-slate-300 font-medium">
                <SortHeader column="varianceScore" align="right">Variance</SortHeader>
              </TableHead>
            )}
            {visibleColumns.views && (
              <TableHead className="w-[90px] text-stone-700 dark:text-slate-300 font-medium text-right">
                <SortHeader column="pageviews" align="right">Views</SortHeader>
              </TableHead>
            )}
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
