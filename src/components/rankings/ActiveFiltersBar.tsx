'use client';

import { useState } from 'react';
import { Share2, X } from 'lucide-react';
import { BADGE_DEFINITIONS, type BadgeType } from '@/types';
import { Button } from '@/components/ui/button';
import { ShareDialog } from '@/components/share/ShareDialog';

type ActiveFiltersBarProps = {
  search: string;
  domain: string | null;
  era: string | null;
  region: string | null;
  modelSource: string | null;
  badgeFilter: BadgeType | null;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  modelLabel: string | null;
  shareUrl: string;
  onSearchChange: (value: string) => void;
  onDomainChange: (value: string | null) => void;
  onEraChange: (value: string | null) => void;
  onRegionChange: (value: string | null) => void;
  onModelSourceChange: (value: string | null) => void;
  onBadgeFilterChange: (value: BadgeType | null) => void;
  onSortChange: (value: string, order: 'asc' | 'desc') => void;
};

const SORT_LABELS: Record<string, string> = {
  llmRank: 'LLM rank',
  hpiRank: 'HPI rank',
  name: 'Name',
  domain: 'Domain',
  era: 'Era',
  regionSub: 'Region',
  varianceScore: 'Variance',
  pageviews: 'Views',
};

export function ActiveFiltersBar({
  search,
  domain,
  era,
  region,
  modelSource,
  badgeFilter,
  sortBy,
  sortOrder,
  modelLabel,
  shareUrl,
  onSearchChange,
  onDomainChange,
  onEraChange,
  onRegionChange,
  onModelSourceChange,
  onBadgeFilterChange,
  onSortChange,
}: ActiveFiltersBarProps) {
  const [shareOpen, setShareOpen] = useState(false);

  const chips: Array<{ label: string; onClear: () => void }> = [];
  if (search) {
    chips.push({ label: `Search: ${search}`, onClear: () => onSearchChange('') });
  }
  if (domain) {
    chips.push({ label: `Domain: ${domain}`, onClear: () => onDomainChange(null) });
  }
  if (era) {
    chips.push({ label: `Era: ${era}`, onClear: () => onEraChange(null) });
  }
  if (region) {
    chips.push({ label: `Region: ${region}`, onClear: () => onRegionChange(null) });
  }
  if (modelSource && modelLabel) {
    chips.push({ label: `Model: ${modelLabel}`, onClear: () => onModelSourceChange(null) });
  }
  if (badgeFilter) {
    const badge = BADGE_DEFINITIONS[badgeFilter];
    chips.push({ label: `Badge: ${badge?.label || badgeFilter}`, onClear: () => onBadgeFilterChange(null) });
  }
  if (sortBy !== 'llmRank' || sortOrder !== 'asc') {
    const label = SORT_LABELS[sortBy] || sortBy;
    chips.push({ label: `Sort: ${label} (${sortOrder})`, onClear: () => onSortChange('llmRank', 'asc') });
  }

  if (chips.length === 0) return null;

  const handleShare = () => setShareOpen(true);

  return (
    <div className="rounded-2xl border border-stone-200/70 bg-white/80 px-4 py-2.5 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1 rounded-full border border-stone-200/80 bg-white px-2.5 py-1 text-xs text-stone-600"
            >
              {chip.label}
              <button
                onClick={chip.onClear}
                className="rounded-full p-0.5 text-stone-400 hover:text-stone-700"
                aria-label={`Remove filter ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleShare}>
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">Share</span>
          </Button>
        </div>
      </div>
      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        url={shareUrl}
        title="HistoryRank rankings"
      />
    </div>
  );
}
