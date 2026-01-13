'use client';

import { useState } from 'react';
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
      className="flex items-center gap-1 hover:text-stone-900 transition-colors cursor-help"
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

  return (
    <div className="border border-stone-200 rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-stone-50 hover:bg-stone-50">
            <TableHead className="w-[60px] text-stone-600 font-medium">
              <SortHeader column="llmRank">LLM</SortHeader>
            </TableHead>
            <TableHead className="w-[60px] text-stone-600 font-medium">
              <SortHeader column="hpiRank">HPI</SortHeader>
            </TableHead>
            <TableHead className="text-stone-600 font-medium">
              <SortHeader column="name">Name</SortHeader>
            </TableHead>
            <TableHead
              className="w-[100px] text-stone-600 font-medium cursor-help"
              title={columnTooltips.domain}
            >
              Domain
            </TableHead>
            <TableHead
              className="w-[100px] text-stone-600 font-medium cursor-help"
              title={columnTooltips.era}
            >
              Era
            </TableHead>
            <TableHead className="w-[110px] text-stone-600 font-medium">
              <SortHeader column="varianceScore">Variance</SortHeader>
            </TableHead>
            <TableHead className="w-[90px] text-stone-600 font-medium text-right">
              <SortHeader column="pageviews">Views</SortHeader>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {figures.map((figure) => (
            <TableRow
              key={figure.id}
              onClick={() => onSelectFigure(figure.id)}
              className={`cursor-pointer transition-colors ${
                selectedId === figure.id
                  ? 'bg-amber-50 hover:bg-amber-100'
                  : 'hover:bg-stone-50'
              }`}
            >
              <TableCell className="font-mono text-sm text-stone-900 font-medium">
                {figure.llmRank ? `#${figure.llmRank}` : '—'}
              </TableCell>
              <TableCell className="font-mono text-sm text-stone-500">
                {formatRank(figure.hpiRank)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <FigureThumbnail
                    wikipediaSlug={figure.wikipediaSlug}
                    name={figure.name}
                    size={32}
                  />
                  <div>
                    <div className="font-medium text-stone-900">{figure.name}</div>
                    {figure.birthYear && (
                      <div className="text-xs text-stone-400">
                        {figure.birthYear < 0 ? `${Math.abs(figure.birthYear)} BCE` : figure.birthYear}
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-sm text-stone-600">
                {figure.domain || '—'}
              </TableCell>
              <TableCell className="text-sm text-stone-600">
                {figure.era || '—'}
              </TableCell>
              <TableCell>
                <VarianceBadge level={figure.varianceLevel} score={figure.varianceScore} />
              </TableCell>
              <TableCell className="font-mono text-sm text-right text-stone-500">
                {formatNumber(figure.pageviews)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
